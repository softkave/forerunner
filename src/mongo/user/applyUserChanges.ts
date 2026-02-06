import {ConsoleForeLogger, IForeLogger} from '../../utils/exports.js';
import {
  closeMongoClient,
  getMongoClient,
  GetMongoClientParams,
} from '../connection.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {findAdminUser} from './findUtils.js';
import {setupUser} from './setupUsers.js';
import {MongoUser} from './types.js';

/**
 * Check if user changes are detected by comparing JSON stringified user arrays.
 * Note: Order matters in JSON comparison, but sufficient for change detection.
 */
export function hasUserChanges(params: {
  cachedConfig: MongoRunConfig;
  currentConfig: MongoRunConfig;
}): boolean {
  const {cachedConfig, currentConfig} = params;
  return (
    JSON.stringify(cachedConfig.users) !== JSON.stringify(currentConfig.users)
  );
}

export interface UserChange {
  user: MongoUser;
  passwordChanged: boolean;
  rolesAdded: Array<{role: string; db: string}>;
  rolesRemoved: Array<{role: string; db: string}>;
}

export interface UserChanges {
  added: MongoUser[];
  removed: MongoUser[];
  updated: UserChange[];
}

/**
 * Analyze user changes by comparing cached and current user lists.
 * Detects added users (in current but not cached), removed users (in cached but not current),
 * and updated users (password changes, role additions/removals).
 * Users are matched by username.
 */
export function getUserChanges(params: {
  cachedConfig: MongoRunConfig;
  currentConfig: MongoRunConfig;
}): UserChanges {
  const {cachedConfig, currentConfig} = params;

  const cachedUsersMap = new Map<string, MongoUser>();
  const currentUsersMap = new Map<string, MongoUser>();

  cachedConfig.users.forEach(user => {
    cachedUsersMap.set(user.username, user);
  });

  currentConfig.users.forEach(user => {
    currentUsersMap.set(user.username, user);
  });

  const added: MongoUser[] = [];
  const removed: MongoUser[] = [];
  const updated: UserChange[] = [];

  // Find added users
  for (const [username, user] of currentUsersMap) {
    if (!cachedUsersMap.has(username)) {
      added.push(user);
    }
  }

  // Find removed users
  for (const [username, user] of cachedUsersMap) {
    if (!currentUsersMap.has(username)) {
      removed.push(user);
    }
  }

  // Find updated users
  for (const [username, currentUser] of currentUsersMap) {
    const cachedUser = cachedUsersMap.get(username);
    if (cachedUser) {
      const passwordChanged = cachedUser.password !== currentUser.password;

      // Compare roles
      const cachedRolesSet = new Set(
        cachedUser.roles.map(r => `${r.role}@${r.db}`)
      );
      const currentRolesSet = new Set(
        currentUser.roles.map(r => `${r.role}@${r.db}`)
      );

      const rolesAdded = currentUser.roles.filter(
        r => !cachedRolesSet.has(`${r.role}@${r.db}`)
      );
      const rolesRemoved = cachedUser.roles.filter(
        r => !currentRolesSet.has(`${r.role}@${r.db}`)
      );

      if (passwordChanged || rolesAdded.length > 0 || rolesRemoved.length > 0) {
        updated.push({
          user: currentUser,
          passwordChanged,
          rolesAdded,
          rolesRemoved,
        });
      }
    }
  }

  return {added, removed, updated};
}

/**
 * Update MongoDB user password using changeUserPassword command.
 * Requires admin user with userAdmin privileges on the user's authDb.
 */
export async function updateMongoUserPassword(
  params: {
    user: MongoUser;
  } & GetMongoClientParams
): Promise<void> {
  const {user, logger = new ConsoleForeLogger({silent: true})} = params;

  const client = await getMongoClient(params);

  try {
    const db = client.db(user.authDb || 'admin');
    const result = await db.command({
      changeUserPassword: user.username,
      pwd: user.password,
    });

    logger.log(
      `Password update for user ${user.username}: ${result.ok ? 'success' : 'failed'}`
    );
  } finally {
    await closeMongoClient(client, params);
  }
}

/**
 * Update MongoDB user roles using grantRolesToUser and revokeRolesFromUser commands.
 * Requires admin user with userAdmin privileges on the user's authDb.
 */
export async function updateMongoUserRoles(
  params: {
    user: MongoUser;
    rolesToAdd: Array<{role: string; db: string}>;
    rolesToRemove: Array<{role: string; db: string}>;
  } & GetMongoClientParams
): Promise<void> {
  const {
    user,
    rolesToAdd,
    rolesToRemove,
    logger = new ConsoleForeLogger({silent: true}),
  } = params;

  const client = await getMongoClient(params);

  try {
    const db = client.db(user.authDb || 'admin');

    if (rolesToAdd.length > 0) {
      const result = await db.command({
        grantRolesToUser: user.username,
        roles: rolesToAdd,
      });
      logger.log(
        `Grant roles to user ${user.username}: ${result.ok ? 'success' : 'failed'}`
      );
    }

    if (rolesToRemove.length > 0) {
      const result = await db.command({
        revokeRolesFromUser: user.username,
        roles: rolesToRemove,
      });
      logger.log(
        `Revoke roles from user ${user.username}: ${result.ok ? 'success' : 'failed'}`
      );
    }
  } finally {
    await closeMongoClient(client, params);
  }
}

/**
 * Update MongoDB user (password and/or roles).
 * Updates password first if changed, then updates roles.
 * Reuses client connection when possible to avoid multiple connections.
 */
export async function updateMongoUser(
  params: {
    user: MongoUser;
    passwordChanged: boolean;
    rolesAdded: Array<{role: string; db: string}>;
    rolesRemoved: Array<{role: string; db: string}>;
  } & GetMongoClientParams
): Promise<void> {
  const {user, passwordChanged, rolesAdded, rolesRemoved} = params;

  const client = await getMongoClient(params);

  try {
    if (passwordChanged) {
      await updateMongoUserPassword({
        ...params,
        client,
      });
    }

    if (rolesAdded.length > 0 || rolesRemoved.length > 0) {
      await updateMongoUserRoles({
        ...params,
        client,
        rolesToAdd: rolesAdded,
        rolesToRemove: rolesRemoved,
      });
    }
  } finally {
    await closeMongoClient(client, params);
  }
}

/**
 * Remove MongoDB user using dropUser command.
 * Requires admin user with userAdmin privileges on the user's authDb.
 */
export async function removeMongoUser(
  params: {
    user: MongoUser;
  } & GetMongoClientParams
): Promise<void> {
  const {user, logger = new ConsoleForeLogger({silent: true})} = params;

  const client = await getMongoClient(params);

  try {
    const db = client.db(user.authDb || 'admin');
    const result = await db.command({
      dropUser: user.username,
    });

    logger.log(
      `Remove user ${user.username}: ${result.ok ? 'success' : 'failed'}`
    );
  } finally {
    await closeMongoClient(client, params);
  }
}

/**
 * Apply all user changes (additions, removals, updates).
 * Uses a single shared client connection for all operations.
 * Order: removals first, then updates, then additions.
 */
export async function applyUserChanges(
  params: {
    userChanges: UserChanges;
    mongoRunConfig: MongoRunConfig;
    logger: IForeLogger;
  } & GetMongoClientParams
): Promise<void> {
  const {userChanges, mongoRunConfig, logger} = params;

  const adminUser = params.authUser
    ? params.authUser
    : findAdminUser({
        users: mongoRunConfig.users,
        isRequired: mongoRunConfig.authorization !== 'disabled',
      });

  const client = await getMongoClient({
    ...params,
    authUser: adminUser,
  });

  try {
    // Remove users first
    for (const user of userChanges.removed) {
      logger.log(`Removing user: ${user.username}`);
      await removeMongoUser({
        ...params,
        user,
        client,
        authUser: adminUser,
      });
    }

    // Update existing users
    for (const change of userChanges.updated) {
      logger.log(`Updating user: ${change.user.username}`);
      await updateMongoUser({
        ...params,
        user: change.user,
        passwordChanged: change.passwordChanged,
        rolesAdded: change.rolesAdded,
        rolesRemoved: change.rolesRemoved,
        client,
        authUser: adminUser,
      });
    }

    // Add new users
    for (const user of userChanges.added) {
      logger.log(`Adding user: ${user.username}`);
      await setupUser({
        ...params,
        user,
        client,
        authUser: adminUser,
      });
    }
  } finally {
    await closeMongoClient(client, params);
  }

  logger.log('User changes applied successfully');
}
