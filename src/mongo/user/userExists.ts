import {ConsoleForeLogger, IForeLogger} from '../../utils/exports.js';
import {
  closeMongoClient,
  getMongoClient,
  GetMongoClientParams,
} from '../connection.js';

export async function checkUserExists(
  params: {
    username: string;
    authDb?: string;
    logger?: IForeLogger;
  } & GetMongoClientParams
) {
  const {
    username,
    authDb = 'admin',
    logger = new ConsoleForeLogger({silent: true}),
  } = params;

  const client = await getMongoClient(params);

  try {
    const db = client.db(authDb);
    const result = await db.command({
      usersInfo: username,
    });

    const userExists = result.users.length > 0;
    logger.log(`${username} exists: ${userExists}`);
    return userExists;
  } finally {
    await closeMongoClient(client, params);
  }
}
