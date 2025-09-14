import fs from 'fs';
import {exists} from 'fs-extra';
import {Db, MongoClient} from 'mongodb';
import path from 'path';
import z from 'zod';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {
  generateMongoPassword,
  getMongoClientForInstance,
  getMongoClientForReplicaSet,
} from './utils.js';

export const MongoUserSchema = z.object({
  username: z.string(),
  password: z.string(),
  authDb: z.string().optional(),
  roles: z.array(
    z.object({
      role: z
        .enum([
          'userAdminAnyDatabase',
          'readAnyDatabase',
          'clusterAdmin',
          'readWrite',
          'read',
        ])
        .or(z.string()),
      db: z.string(),
    })
  ),
});

export const MongoUserListSchema = z.array(MongoUserSchema);

export type MongoUser = z.infer<typeof MongoUserSchema>;
export type MongoUserList = z.infer<typeof MongoUserListSchema>;

export async function setupSingleMongoUser(params: {
  user: MongoUser;
  adminUser?: MongoUser;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  preferLocalhost?: boolean;
  client?: MongoClient;
  /** Do not close the client after setup */
  retainClient?: boolean;
  /** Only used if a client is provided */
  connectionType?: 'replicaSet' | 'instance';
}) {
  const {
    user,
    adminUser,
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    preferLocalhost,
    client: incomingClient,
    retainClient,
    connectionType = 'replicaSet',
  } = params;

  const client =
    incomingClient ||
    (connectionType === 'replicaSet'
      ? await getMongoClientForReplicaSet({
          username: adminUser?.username,
          password: adminUser?.password,
          mongoRunConfig,
          logger,
          preferLocalhost,
        })
      : await getMongoClientForInstance({
          username: adminUser?.username,
          password: adminUser?.password,
          mongoRunConfig,
          logger,
          preferLocalhost,
        }));

  try {
    // Use the authDb specified in the user config or default to 'admin'
    const db = client.db(user.authDb || 'admin');
    const {userExists} = await checkUserExists({
      user,
      db,
      logger,
    });

    if (userExists) {
      logger.log(`User ${user.username} already exists`);
      return;
    }

    const result = await db.command({
      createUser: user.username,
      pwd: user.password,
      roles: user.roles.map(role => ({role: role.role, db: role.db})),
    });

    logger.log('username', user.username, result.ok ? 'success' : 'failed');
    return retainClient ? client : undefined;
  } finally {
    // Close the database connection on completion or error
    if (!retainClient) {
      await client.close();
    }
  }
}

export async function readMongoUsers(params: {configFilePath: string}) {
  const {configFilePath} = params;
  if (!(await exists(configFilePath))) {
    return [];
  }

  const fileContent = await fs.promises.readFile(configFilePath, 'utf8');

  // Parse the JSON string first, then validate with Zod
  const parsedContent = JSON.parse(fileContent);

  const mongoUsers = MongoUserListSchema.parse(parsedContent);
  return mongoUsers;
}

export async function findAdminMongoUser(params: {
  mongoUsers: MongoUserList;
  createIfNotFound: boolean;
}) {
  const {mongoUsers, createIfNotFound} = params;
  let adminUser = mongoUsers.find(user =>
    user.roles.some(role => role.role === 'userAdminAnyDatabase')
  );

  if (createIfNotFound && !adminUser) {
    adminUser = {
      username: 'admin',
      password: generateMongoPassword(),
      authDb: 'admin',
      roles: [
        {role: 'userAdminAnyDatabase', db: 'admin'},
        {role: 'readAnyDatabase', db: 'admin'},
      ],
    };
  }

  if (!adminUser) {
    throw new Error('Admin user not found');
  }

  return adminUser;
}

export async function findClusterAdminMongoUser(params: {
  mongoUsers: MongoUserList;
  createIfNotFound: boolean;
}) {
  const {mongoUsers, createIfNotFound} = params;
  let clusterAdminUser = mongoUsers.find(user =>
    user.roles.some(role => role.role === 'clusterAdmin')
  );

  if (createIfNotFound && !clusterAdminUser) {
    clusterAdminUser = {
      username: 'clusterAdmin',
      password: generateMongoPassword(),
      authDb: 'admin',
      roles: [{role: 'clusterAdmin', db: 'admin'}],
    };
  }

  return clusterAdminUser;
}

async function checkUserExists(params: {
  user: MongoUser;
  logger: IForeLogger;
  db: Db;
}) {
  const {user, logger = new ConsoleForeLogger({silent: true}), db} = params;
  const result = await db.command({
    usersInfo: user.username,
  });

  logger.log(`${user.username} exists: ${result.users.length > 0}`);
  const userExists = result.users.length > 0;
  return {
    userExists,
  };
}

export function getMongoUsersConfigFilePath(mongoRunConfig: MongoRunConfig) {
  return path.join(mongoRunConfig.workingDir, 'mongo-users.json');
}

export async function setupMongoUsersMain(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}) {
  const {mongoRunConfig, logger = new ConsoleForeLogger({silent: true})} =
    params;
  const mongoUsers = await readMongoUsers({
    configFilePath: getMongoUsersConfigFilePath(mongoRunConfig),
  });
  const adminUser = await findAdminMongoUser({
    mongoUsers,
    createIfNotFound: true,
  });
  if (!adminUser) {
    throw new Error('Admin user not found');
  }

  const otherUsers = mongoUsers.filter(
    user => user.username !== adminUser.username
  );
  await Promise.all(
    otherUsers.map(async user => {
      logger.log(`Setting up user ${user.username}`);
      await setupSingleMongoUser({user, adminUser, mongoRunConfig, logger});
    })
  );
}
