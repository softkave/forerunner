import fs from 'fs';
import {ensureFile, exists} from 'fs-extra';
import {compact, uniqBy} from 'lodash-es';
import {convertToArray} from 'softkave-js-utils';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {
  findAdminMongoUser,
  findClusterAdminMongoUser,
  getMongoUsersConfigFilePath,
  MongoUser,
  MongoUserList,
  MongoUserListSchema,
  readMongoUsers,
} from './setupMongoUsers.js';

export async function getMongoUsers(params: {mongoRunConfig: MongoRunConfig}) {
  const {mongoRunConfig} = params;
  const configFilePath = getMongoUsersConfigFilePath(mongoRunConfig);
  if (!(await exists(configFilePath))) {
    return [];
  }

  const mongoUsers = MongoUserListSchema.parse(
    JSON.parse(await fs.promises.readFile(configFilePath, 'utf8'))
  );
  return mongoUsers;
}

export async function writeMongoUser(params: {
  mongoRunConfig: MongoRunConfig;
  users: MongoUser | MongoUserList;
  logger: IForeLogger;
}) {
  const {
    mongoRunConfig,
    users,
    logger = new ConsoleForeLogger({silent: true}),
  } = params;

  const existingMongoUsers = await getMongoUsers({mongoRunConfig});
  const mongoUsers = convertToArray(users);
  const existingMongoUsersMap = new Map(
    existingMongoUsers.map(user => [user.username, user])
  );
  const newMongoUsers = mongoUsers.filter(
    user => !existingMongoUsersMap.has(user.username)
  );
  const updatedMongoUsers = existingMongoUsers.concat(newMongoUsers);

  const configFilePath = getMongoUsersConfigFilePath(mongoRunConfig);
  logger.log('configFilePath', configFilePath);
  await ensureFile(configFilePath);
  await fs.promises.writeFile(
    configFilePath,
    JSON.stringify(updatedMongoUsers, null, 2)
  );
}

export async function writeMongoUsersFromConfig(params: {
  mongoRunConfig: MongoRunConfig;
  usersFilePath?: string;
  createAdmin?: boolean;
  createClusterAdmin?: boolean;
  logger: IForeLogger;
}) {
  const {
    mongoRunConfig,
    usersFilePath,
    createAdmin = false,
    createClusterAdmin = false,
    logger = new ConsoleForeLogger({silent: true}),
  } = params;

  // Read existing users from the config file
  const existingMongoUsers = await readMongoUsers({
    configFilePath: getMongoUsersConfigFilePath(mongoRunConfig),
  });

  // Read users from file if provided
  let fileUsers: MongoUserList = [];
  if (usersFilePath) {
    fileUsers = await readMongoUsers({configFilePath: usersFilePath});
  }

  const mongoUsers = [
    ...mongoRunConfig.users,
    ...existingMongoUsers,
    ...fileUsers,
  ];

  // Find or create admin user if requested
  let adminUser: MongoUser | undefined;
  adminUser = await findAdminMongoUser({
    mongoUsers,
    createIfNotFound: createAdmin,
  });

  // Find or create cluster admin user if requested
  let clusterAdminUser: MongoUser | undefined;
  clusterAdminUser = await findClusterAdminMongoUser({
    mongoUsers,
    createIfNotFound: createClusterAdmin,
  });

  // Combine all users, removing duplicates by username
  const users = uniqBy(
    compact([adminUser, clusterAdminUser, ...mongoUsers]),
    user => user.username
  );

  // Write the combined users to the config file
  await writeMongoUser({mongoRunConfig, users, logger});
}
