import assert from 'assert';
import fs from 'fs';
import {generate} from 'generate-password';
import {load} from 'js-yaml';
import {MongoClient} from 'mongodb';
import {convertToArray} from 'softkave-js-utils';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {
  getMongodConfigFilePath,
  MongoConfigSchema,
} from './generateMongodConfigs.js';
import {MongoRunConfig} from './mongoRunConfig.js';

export async function getMongodConfigForInstance(params: {
  /** Instance number (1-based) */
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
}) {
  const {mongoRunConfig} = params;
  const {instanceNumber} = params;
  const configFilePath = getMongodConfigFilePath(
    mongoRunConfig,
    instanceNumber
  );
  const config = MongoConfigSchema.parse(
    load(await fs.promises.readFile(configFilePath, 'utf8'))
  );
  return config;
}

export async function getMongodConfigs(params: {
  replicaCount: number;
  mongoRunConfig: MongoRunConfig;
}) {
  const {replicaCount, mongoRunConfig} = params;
  const configs = await Promise.all(
    Array.from({length: replicaCount}, async (_, i) => {
      return await getMongodConfigForInstance({
        instanceNumber: i + 1,
        mongoRunConfig,
      });
    })
  );
  return configs;
}

export function separateBindIps(bindIp: string) {
  return bindIp.split(',');
}

export function isLocalhostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function getNonLocalhostBindIps(params: {
  bindIp?: string;
  hostnames?: string[];
}) {
  const hostnames = [
    ...(params.bindIp ? separateBindIps(params.bindIp) : []),
    ...(params.hostnames || []),
  ];
  return hostnames.filter(hostname => !isLocalhostname(hostname));
}

export function getLocalhostBindIps(params: {
  bindIp?: string;
  hostnames?: string[] | string;
}) {
  const hostnames = [
    ...(params.bindIp ? separateBindIps(params.bindIp) : []),
    ...(params.hostnames || []),
  ];
  return hostnames.filter(hostname => isLocalhostname(hostname));
}

export function getFirstNonLocalhostBindIp(params: {
  bindIp?: string;
  hostnames?: string[] | string;
}) {
  const bindIps = getNonLocalhostBindIps({
    bindIp: params.bindIp,
    hostnames: params.hostnames ? convertToArray(params.hostnames) : undefined,
  });
  return bindIps[0] as string | undefined;
}

export function getFirstLocalhostBindIp(params: {
  bindIp?: string;
  hostnames?: string[] | string;
}) {
  const bindIps = getLocalhostBindIps({
    bindIp: params.bindIp,
    hostnames: params.hostnames ? convertToArray(params.hostnames) : undefined,
  });
  return bindIps[0] as string | undefined;
}

export async function getMongoUriForInstance(params: {
  /** Instance number (1-based) */
  instanceNumber: number;
  username?: string;
  password?: string;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  preferLocalhost?: boolean;
}) {
  const {instanceNumber, mongoRunConfig, logger} = params;
  const mongodConfig = await getMongodConfigForInstance({
    instanceNumber,
    mongoRunConfig,
  });

  const bindIps = separateBindIps(mongodConfig.net.bindIp);
  const bindIp0 = params.preferLocalhost
    ? getFirstLocalhostBindIp({bindIp: mongodConfig.net.bindIp}) || bindIps[0]
    : bindIps[0];
  let host = `${bindIp0}:${mongodConfig.net.port}`;
  let uri = `mongodb://${host}`;
  logger.log('Mongo URI:', uri);
  if (params.username && params.password) {
    uri = `mongodb://${encodeURIComponent(params.username)}:${encodeURIComponent(params.password)}@${host}`;
  }

  return uri;
}

export function compileHostnames(params: {
  initialHostnames: string[] | string;
  bindLocalhost: boolean;
}) {
  const {initialHostnames, bindLocalhost} = params;
  let hostnames = convertToArray(initialHostnames);
  if (bindLocalhost) {
    hostnames = [...hostnames, 'localhost', '127.0.0.1'];
  }

  return hostnames;
}

export async function getMongoUriForReplicaSet(params: {
  username?: string;
  password?: string;
  mongoRunConfig: MongoRunConfig;
  serverSelectionTimeoutMs?: number;
  logger: IForeLogger;
  preferLocalhost?: boolean;
}) {
  const {mongoRunConfig, serverSelectionTimeoutMs = 5000, logger} = params;
  const hostnamesPerInstance = mongoRunConfig.instancePorts.map(
    (_port, index) => {
      const hostnames = compileHostnames({
        initialHostnames: mongoRunConfig.instancesHostnames[index] ?? [],
        bindLocalhost: mongoRunConfig.bindLocalhost || false,
      });
      let hostname: string | undefined;
      if (params.preferLocalhost) {
        hostname = getFirstLocalhostBindIp({hostnames});
      } else {
        hostname = getFirstNonLocalhostBindIp({hostnames});
      }

      const preferredHostname = hostname || hostnames[0];
      assert.ok(
        preferredHostname,
        `instanceHostnames or bindLocalhost must be set for instance ${index + 1}`
      );

      return preferredHostname;
    }
  );

  const portsPerInstance = mongoRunConfig.instancePorts;
  const host = hostnamesPerInstance
    .map((hostname, index) => {
      const port = portsPerInstance[index];
      assert.ok(hostname, `hostname must be set for instance ${index}`);
      assert.ok(port, `port must be set for instance ${index}`);
      return `${hostname}:${port}`;
    })
    .join(',');

  let uriWithoutProtocol = `${host}?replicaSet=${mongoRunConfig.replicaSetName}&serverSelectionTimeoutMs=${serverSelectionTimeoutMs}`;
  logger.log('Mongo URI:', uriWithoutProtocol);
  if (params.username && params.password) {
    const username = encodeURIComponent(params.username);
    const password = encodeURIComponent(params.password);
    uriWithoutProtocol = `${username}:${password}@${uriWithoutProtocol}`;
  }

  const uri = `mongodb://${uriWithoutProtocol}`;
  return uri;
}

export async function getMongoClientForInstance(params: {
  username?: string;
  password?: string;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  preferLocalhost?: boolean;
  /** Instance number (1-based) */
  instanceNumber?: number;
  connectTimeoutMs?: number;
}) {
  const {
    logger = new ConsoleForeLogger({silent: true}),
    mongoRunConfig,
    instanceNumber = 1,
    connectTimeoutMs = 5_000,
  } = params;

  const uri = await getMongoUriForInstance({
    instanceNumber,
    username: params.username,
    password: params.password,
    mongoRunConfig: mongoRunConfig,
    logger,
    preferLocalhost: params.preferLocalhost,
  });

  const client = new MongoClient(uri, {
    connectTimeoutMS: connectTimeoutMs,
    directConnection: true,
    tls: true,
    tlsAllowInvalidCertificates: true,
  });
  await client.connect();
  logger.log('Connected to MongoDB');

  return client;
}

export async function getMongoClientForReplicaSet(params: {
  username?: string;
  password?: string;
  mongoRunConfig: MongoRunConfig;
  serverSelectionTimeoutMs?: number;
  connectTimeoutMs?: number;
  logger: IForeLogger;
  preferLocalhost?: boolean;
}) {
  const {
    serverSelectionTimeoutMs = 12_000,
    connectTimeoutMs = 5_000,
    logger = new ConsoleForeLogger({silent: true}),
    mongoRunConfig,
  } = params;

  const uri = await getMongoUriForReplicaSet({
    logger,
    serverSelectionTimeoutMs,
    username: params.username,
    password: params.password,
    mongoRunConfig: mongoRunConfig,
    preferLocalhost: params.preferLocalhost,
  });

  const client = new MongoClient(uri, {
    tls: true,
    tlsAllowInvalidCertificates: true,
    connectTimeoutMS: connectTimeoutMs,
  });
  await client.connect();
  logger.log(
    `Connected to MongoDB replica set ${mongoRunConfig.replicaSetName}`
  );

  return client;
}

export function generateMongoPassword() {
  return generate({
    length: 32,
    numbers: true,
    symbols: false,
    uppercase: true,
    strict: true,
  });
}
