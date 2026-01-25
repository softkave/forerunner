import {MongoClient} from 'mongodb';
import {OmitFrom} from 'softkave-js-utils';
import {IForeLogger} from '../utils/exports.js';
import {
  MongoRunConfig,
  getMongoClientForInstance,
  getMongoClientForReplicaSet,
} from './index.js';
import {MongoUser} from './user/types.js';

export async function closeMongoClient(client?: MongoClient): Promise<void> {
  try {
    await client?.close();
  } catch {
    // Ignore close errors
  }
}

export interface GetMongoClientParams {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  authUser?: Pick<MongoUser, 'username' | 'password'>;
  client?: MongoClient;
  connectionType?: 'replicaSet' | 'instance';
  preferLocalhost?: boolean;
  instanceNumber?: number;
  connectTimeoutMs?: number;
  serverSelectionTimeoutMs?: number;
}

export async function checkInstanceConnectable(
  params: OmitFrom<
    GetMongoClientParams,
    'client' | 'connectionType' | 'serverSelectionTimeoutMs'
  >
): Promise<boolean> {
  const {
    instanceNumber,
    mongoRunConfig,
    logger,
    authUser: user,
    connectTimeoutMs,
    preferLocalhost = true,
  } = params;

  let client: MongoClient | undefined;

  try {
    client = await getMongoClientForInstance({
      mongoRunConfig,
      instanceNumber,
      logger,
      connectTimeoutMs,
      preferLocalhost,
      ...(user ? {username: user.username, password: user.password} : {}),
    });

    await closeMongoClient(client);
    return true;
  } catch {
    return false;
  } finally {
    await closeMongoClient(client);
  }
}

export async function getMongoClient(
  params: GetMongoClientParams
): Promise<MongoClient> {
  const {
    authUser,
    mongoRunConfig,
    logger,
    connectTimeoutMs,
    instanceNumber,
    client: incomingClient,
    connectionType = 'replicaSet',
    preferLocalhost = true,
    serverSelectionTimeoutMs,
  } = params;

  if (incomingClient) {
    return incomingClient;
  }

  return connectionType === 'replicaSet'
    ? await getMongoClientForReplicaSet({
        username: authUser?.username,
        password: authUser?.password,
        mongoRunConfig,
        logger,
        preferLocalhost,
        serverSelectionTimeoutMs,
        connectTimeoutMs,
      })
    : await getMongoClientForInstance({
        username: authUser?.username,
        password: authUser?.password,
        connectTimeoutMs,
        instanceNumber,
        mongoRunConfig,
        logger,
        preferLocalhost,
      });
}
