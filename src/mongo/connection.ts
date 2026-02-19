import {MongoClient} from 'mongodb';
import {ConsoleForeLogger, IForeLogger} from '../utils/exports.js';
import {
  MongoRunConfig,
  getMongoUriForInstance,
  getMongoUriForReplicaSet,
} from './index.js';
import {MongoUser} from './user/types.js';

export interface GetMongoClientForInstanceParams {
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
  authUser?: Pick<MongoUser, 'username' | 'password'>;
  client?: MongoClient;
  preferLocalhost?: boolean;
  /** Instance number (1-based) */
  instanceNumber?: number;
  connectTimeoutMs?: number;
}

export interface GetMongoClientForReplicaSetParams {
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
  authUser?: Pick<MongoUser, 'username' | 'password'>;
  client?: MongoClient;
  preferLocalhost?: boolean;
  connectTimeoutMs?: number;
  serverSelectionTimeoutMs?: number;
}

export interface GetMongoClientParams
  extends GetMongoClientForInstanceParams, GetMongoClientForReplicaSetParams {
  connectionType?: 'replicaSet' | 'instance';
}

export function isConnectedToReplicaSet(client: MongoClient): boolean {
  return client.options.hosts.length > 1;
}

export async function closeMongoClient(
  client: MongoClient | undefined | null,
  params: Pick<GetMongoClientParams, 'client'>,
  force?: boolean
): Promise<void> {
  try {
    if ((!params.client && client) || force) {
      await client?.close();
    }
  } catch {
    // Ignore close errors
  }
}

export async function getMongoClientForInstance(
  params: GetMongoClientForInstanceParams
) {
  const {
    logger = new ConsoleForeLogger({silent: true}),
    mongoRunConfig,
    instanceNumber = 1,
    connectTimeoutMs = 5_000,
    authUser,
  } = params;

  const uri = await getMongoUriForInstance({
    instanceNumber,
    username: authUser?.username,
    password: authUser?.password,
    mongoRunConfig: mongoRunConfig,
    logger,
    preferLocalhost: params.preferLocalhost,
  });

  const hasTLS = mongoRunConfig.ssl !== 'disabled';
  const client = new MongoClient(uri, {
    connectTimeoutMS: connectTimeoutMs,
    directConnection: true,
    ...(hasTLS
      ? {
          tls: true,
          tlsAllowInvalidCertificates: true,
        }
      : {}),
  });
  await client.connect();
  logger.log('Connected to MongoDB');

  return client;
}

export async function getMongoClientForReplicaSet(
  params: GetMongoClientForReplicaSetParams
) {
  const {
    serverSelectionTimeoutMs = 12_000,
    connectTimeoutMs = 5_000,
    logger = new ConsoleForeLogger({silent: true}),
    mongoRunConfig,
    authUser,
    preferLocalhost,
  } = params;

  const uri = await getMongoUriForReplicaSet({
    logger,
    serverSelectionTimeoutMs,
    username: authUser?.username,
    password: authUser?.password,
    mongoRunConfig: mongoRunConfig,
    preferLocalhost: preferLocalhost,
  });

  const hasTLS = mongoRunConfig.ssl !== 'disabled';
  const client = new MongoClient(uri, {
    ...(hasTLS
      ? {
          tls: true,
          tlsAllowInvalidCertificates: true,
        }
      : {}),
    connectTimeoutMS: connectTimeoutMs,
  });
  await client.connect();
  logger.log(
    `Connected to MongoDB replica set ${mongoRunConfig.replicaSetName}`
  );

  return client;
}

export async function checkInstanceConnectable(
  params: GetMongoClientForInstanceParams
): Promise<boolean> {
  let client: MongoClient | undefined;

  try {
    client = await getMongoClientForInstance(params);
    await closeMongoClient(client, params);
    return true;
  } catch {
    return false;
  } finally {
    await closeMongoClient(client, params);
  }
}

export async function getMongoClient(
  params: GetMongoClientParams
): Promise<MongoClient> {
  const {client: incomingClient, connectionType = 'replicaSet'} = params;

  if (incomingClient) {
    const isReplicaSet = isConnectedToReplicaSet(incomingClient);
    if (connectionType == 'replicaSet' && isReplicaSet) {
      return incomingClient;
    } else if (connectionType == 'instance' && !isReplicaSet) {
      return incomingClient;
    }

    throw new Error(`Provided client is not a ${connectionType} connection`);
  }

  return connectionType === 'replicaSet'
    ? await getMongoClientForReplicaSet(params)
    : await getMongoClientForInstance(params);
}
