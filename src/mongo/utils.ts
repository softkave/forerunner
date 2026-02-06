import assert from 'assert';
import {generate} from 'generate-password';
import {convertToArray} from 'softkave-js-utils';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';

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

  const hostnames = compileHostnames({
    hostnames: mongoRunConfig.instancesHostnames[instanceNumber - 1],
    bindLocalhost: mongoRunConfig.bindLocalhost ?? false,
  });
  const bindIp0 = params.preferLocalhost
    ? getFirstLocalhostBindIp({hostnames}) || hostnames[0]
    : hostnames[0];
  let host = `${bindIp0}:${mongoRunConfig.instancePorts[instanceNumber - 1]}`;
  let uri = `mongodb://${host}`;
  logger.log('Mongo URI:', uri);
  if (params.username && params.password) {
    uri = `mongodb://${encodeURIComponent(params.username)}:${encodeURIComponent(params.password)}@${host}`;
  }

  return uri;
}

export function compileHostnames(params: {
  hostnames: string[] | string;
  bindLocalhost: boolean;
}) {
  const {hostnames: initialHostnames, bindLocalhost} = params;
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
        hostnames: mongoRunConfig.instancesHostnames[index] ?? [],
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

export function generateMongoPassword() {
  return generate({
    length: 32,
    numbers: true,
    symbols: false,
    uppercase: true,
    strict: true,
  });
}
