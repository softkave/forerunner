import {ConsoleForeLogger, IForeLogger} from '../../utils/exports.js';
import {
  closeMongoClient,
  getMongoClient,
  GetMongoClientParams,
} from '../connection.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {findAdminUser} from './findUtils.js';
import {MongoUser} from './types.js';
import {checkUserExists} from './userExists.js';

export async function setupUser(
  params: {
    user: MongoUser;
    mongoRunConfig: MongoRunConfig;
    logger: IForeLogger;
    skipExistsCheck?: boolean;
  } & GetMongoClientParams
) {
  const {
    user,
    logger = new ConsoleForeLogger({silent: true}),
    skipExistsCheck = false,
  } = params;

  const client = await getMongoClient(params);

  try {
    if (!skipExistsCheck) {
      const userExists = await checkUserExists({
        ...params,
        username: user.username,
        authDb: user.authDb,
      });

      if (userExists) {
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
    if (client && !params.client) {
      await closeMongoClient(client);
    }
  }
}

export async function setupUsers(
  params: {
    mongoRunConfig: MongoRunConfig;
    logger: IForeLogger;
  } & GetMongoClientParams
) {
  const {mongoRunConfig, logger = new ConsoleForeLogger({silent: true})} =
    params;

  const adminUser = findAdminUser({
    users: mongoRunConfig.users,
    isRequired: mongoRunConfig.authorization !== 'disabled',
  });

  if (adminUser) {
    logger.log(`Setting up admin user ${adminUser.username}`);
    await setupUser({
      user: adminUser,
      ...params,
      // Skip exists check if there is no auth user, meaning we are probably
      // setting up the first user using localhost auth bypass, which only
      // permits create user & setup replica set commands.
      skipExistsCheck:
        !params.authUser && mongoRunConfig.authorization !== 'disabled',
    });
  }

  const otherUsers = adminUser
    ? mongoRunConfig.users.filter(user => user.username !== adminUser.username)
    : mongoRunConfig.users;

  for (const user of otherUsers) {
    logger.log(`Setting up user ${user.username}`);
    await setupUser({user, ...params, authUser: params.authUser || adminUser});
  }
}
