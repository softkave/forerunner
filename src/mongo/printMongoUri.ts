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
  preferLocalhost?: boolean;
  serverSelectionTimeoutMs?: number;
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
  } = options;

  let uri: string;
  const password =
    options.password ??
    mongoRunConfig.users?.find(user => user.username === username)?.password;

  if (connectionType === 'instance') {
    uri = await getMongoUriForInstance({
      instanceNumber,
      username,
      password,
      mongoRunConfig,
      logger,
      preferLocalhost,
    });
  } else {
    uri = await getMongoUriForReplicaSet({
      username,
      password,
      mongoRunConfig,
      serverSelectionTimeoutMs,
      logger,
      preferLocalhost,
    });
  }

  logger.log('MongoDB URI:', uri);
  return uri;
}
