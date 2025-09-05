import fs from 'fs';
import {ensureFile, exists} from 'fs-extra';
import {convertToArray} from 'softkave-js-utils';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {
  getMongoUsersConfigFilePath,
  MongoUser,
  MongoUserList,
  MongoUserListSchema,
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
