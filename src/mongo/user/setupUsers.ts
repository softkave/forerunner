import {ConsoleForeLogger, IForeLogger} from '../../utils/exports.js';
import {
  closeMongoClient,
  getMongoClient,
  GetMongoClientParams,
} from '../connection.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {
  removeMongoUser,
  updateMongoUserPassword,
  updateMongoUserRoles,
} from './applyUserChanges.js';
import {findAdminUser} from './findUtils.js';
import {MongoUser} from './types.js';

export interface ExistingDbUser {
  username: string;
  authDb: string;
  roles: Array<{role: string; db: string}>;
}

/**
 * List all users in the database using usersInfo with forAllDBs.
 * Run on admin database; requires viewUser on the target auth db(s).
 */
export async function getExistingUsers(
  params: GetMongoClientParams
): Promise<ExistingDbUser[]> {
  const client = await getMongoClient(params);

  try {
    const adminDb = client.db('admin');
    const result = (await adminDb.command({
      usersInfo: {forAllDBs: true},
    })) as {
      users?: Array<{
        user: string;
        db: string;
        roles?: Array<{role: string; db: string}>;
      }>;
      ok?: number;
    };

    if (!result.ok || !result.users) {
      return [];
    }

    return result.users.map(u => ({
      username: u.user,
      authDb: u.db,
      roles: u.roles ?? [],
    }));
  } finally {
    await closeMongoClient(client, params);
  }
}

function userKey(username: string, authDb: string): string {
  return `${username}@${authDb || 'admin'}`;
}

function isAdminUser(user: ExistingDbUser | MongoUser): boolean {
  return (user.roles ?? []).some(r => r.role === 'userAdminAnyDatabase');
}

export async function setupUser(
  params: {
    user: MongoUser;
    mongoRunConfig?: MongoRunConfig;
    logger?: IForeLogger;
    skipExistenceCheck?: boolean;
  } & GetMongoClientParams
) {
  const {
    user,
    logger = new ConsoleForeLogger({silent: true}),
    skipExistenceCheck = false,
  } = params;

  const client = await getMongoClient(params);

  try {
    if (!skipExistenceCheck) {
      const db = client.db(user.authDb || 'admin');
      const result = (await db.command({
        usersInfo: user.username,
      })) as {users?: unknown[]};
      if (result.users && result.users.length > 0) {
        logger.log(`User ${user.username} already exists`);
        return;
      }
    }

    const db = client.db(user.authDb || 'admin');
    const result = await db.command({
      createUser: user.username,
      pwd: user.password,
      roles: user.roles.map(role => ({role: role.role, db: role.db})),
    });

    logger.log(
      `User ${user.username} setup: ${result.ok ? 'success' : 'failed'}`
    );
  } finally {
    await closeMongoClient(client, params);
  }
}

export async function setupUsers(params: GetMongoClientParams) {
  const {mongoRunConfig, logger = new ConsoleForeLogger({silent: true})} =
    params;

  if (!mongoRunConfig.users.length) {
    logger.log('No users in config; skipping user setup');
    return;
  }

  const adminUser = findAdminUser({
    users: mongoRunConfig.users,
    isRequired: false,
  });

  // When authorization is enabled and no authUser is passed, create the first
  // admin user from config (localhost auth bypass), then use it for the rest.
  if (
    mongoRunConfig.authorization === 'enabled' &&
    !params.authUser &&
    adminUser
  ) {
    logger.log(`Setting up admin user ${adminUser.username}`);
    await setupUser({
      user: adminUser,
      ...params,
      skipExistenceCheck: true,
    });
  }

  const effectiveAuthUser = params.authUser ?? adminUser ?? undefined;

  if (mongoRunConfig.authorization !== 'disabled' && !effectiveAuthUser) {
    throw new Error(
      'authUser or an admin user in config is required when authorization is enabled'
    );
  }

  const client = await getMongoClient({
    ...params,
    authUser: effectiveAuthUser,
  });

  try {
    const existing = await getExistingUsers({...params, client});
    const existingByKey = new Map(
      existing.map(u => [userKey(u.username, u.authDb), u])
    );
    const configByKey = new Map(
      mongoRunConfig.users.map(u => [
        userKey(u.username, u.authDb ?? 'admin'),
        u,
      ])
    );

    // 1) Add users that don't exist; update existing users (role diff + password)
    // Password: DB stores SCRAM hash, so we can't compare config plaintext to detect
    // change. We always set password when syncing an existing user so config is source of truth.
    for (const configUser of mongoRunConfig.users) {
      const key = userKey(configUser.username, configUser.authDb ?? 'admin');
      const existingUser = existingByKey.get(key);

      if (!existingUser) {
        logger.log(`Adding user ${configUser.username}`);
        await setupUser({
          ...params,
          user: configUser,
          client,
          authUser: effectiveAuthUser,
        });
        continue;
      }

      const configRolesSet = new Set(
        configUser.roles.map(r => `${r.role}@${r.db}`)
      );
      const dbRolesSet = new Set(
        existingUser.roles.map(r => `${r.role}@${r.db}`)
      );
      const rolesToAdd = configUser.roles.filter(
        r => !dbRolesSet.has(`${r.role}@${r.db}`)
      );
      const rolesToRemove = existingUser.roles.filter(
        r => !configRolesSet.has(`${r.role}@${r.db}`)
      );

      const needsRoleUpdate = rolesToAdd.length > 0 || rolesToRemove.length > 0;

      if (needsRoleUpdate) {
        logger.log(`Updating user ${configUser.username} (roles)`);
        await updateMongoUserRoles({
          ...params,
          user: configUser,
          rolesToAdd,
          rolesToRemove,
          client,
          authUser: effectiveAuthUser,
        });
      }

      await updateMongoUserPassword({
        ...params,
        user: configUser,
        client,
        authUser: effectiveAuthUser,
      });
    }

    // 2) Remove users that are in DB but not in config (do not remove sole admin)
    const configAdminCount = mongoRunConfig.users.filter(u =>
      isAdminUser(u)
    ).length;

    for (const dbUser of existing) {
      const key = userKey(dbUser.username, dbUser.authDb);
      if (configByKey.has(key)) continue;

      if (isAdminUser(dbUser) && configAdminCount === 0) {
        logger.log(
          `Skipping removal of admin user ${dbUser.username} (no other admin in config)`
        );
        continue;
      }

      logger.log(`Removing user ${dbUser.username}`);
      await removeMongoUser({
        ...params,
        user: {
          username: dbUser.username,
          password: '',
          authDb: dbUser.authDb,
          roles: dbUser.roles,
        },
        client,
        authUser: effectiveAuthUser,
      });
    }

    logger.log('User setup completed');
  } finally {
    await closeMongoClient(client, params);
  }
}
