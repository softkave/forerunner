import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {getMongoUriForInstance, getMongoUriForReplicaSet} from './utils.js';

export interface PrintMongoUriOptions {
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
  connectionType?: 'instance' | 'replicaSet';
  instanceNumber?: number;
  username?: string;
  password?: string;
  database?: string;
  preferLocalhost?: boolean;
  serverSelectionTimeoutMs?: number;
  includeTls?: boolean;
}

export async function printMongoUriMain(options: PrintMongoUriOptions) {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: false}),
    connectionType = 'replicaSet',
    instanceNumber = 1,
    username,
    preferLocalhost = false,
    serverSelectionTimeoutMs = 5000,
    database,
    includeTls = true,
  } = options;

  let uri: string;
  const password =
    options.password ??
    (username
      ? mongoRunConfig.users?.find(user => user.username === username)?.password
      : undefined);

  if (connectionType === 'instance') {
    uri = await getMongoUriForInstance({
      instanceNumber,
      username,
      password,
      database,
      mongoRunConfig,
      logger,
      preferLocalhost,
      includeTls,
    });
  } else {
    uri = await getMongoUriForReplicaSet({
      username,
      password,
      database,
      mongoRunConfig,
      serverSelectionTimeoutMs,
      logger,
      preferLocalhost,
      includeTls,
    });
  }

  logger.log('MongoDB URI:', uri);
  return uri;
}
