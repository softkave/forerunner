import {
  EtcHostsSetupMode,
  ensureHostnamesResolvable,
} from '../etcHosts/ensureHostnamesResolvable.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {checkMongoInstancesListening} from './checkMongoReadyState.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {compileHostnames, getFirstNonLocalhostBindIp} from './utils.js';

export function collectMongoReplicaSetHostnames(
  mongoRunConfig: MongoRunConfig
): string[] {
  const seen = new Set<string>();
  for (const entry of mongoRunConfig.hostnames) {
    const hostnames = compileHostnames({hostnames: entry});
    const hostname = getFirstNonLocalhostBindIp({hostnames});
    if (hostname) {
      seen.add(hostname);
    }
  }
  return Array.from(seen);
}

export function collectMongoReplicaSetHostnamePorts(
  mongoRunConfig: MongoRunConfig
): Array<{hostname: string; port: number}> {
  return mongoRunConfig.ports.map((port, index) => {
    const hostnames = compileHostnames({
      hostnames: mongoRunConfig.hostnames[index] ?? [],
    });
    const hostname = getFirstNonLocalhostBindIp({hostnames});
    if (!hostname) {
      throw new Error(`hostname must be set for instance ${index + 1}`);
    }
    return {hostname, port};
  });
}

/** IP written to /etc/hosts; defaults to loopback for local Docker port
 * publishing. */
export function resolveMongoEtcHostsIp(explicit?: string): string {
  return explicit ?? '127.0.0.1';
}

export async function ensureMongoHostnamesResolvable(params: {
  mongoRunConfig: MongoRunConfig;
  mode?: EtcHostsSetupMode;
  logger: IForeLogger;
  /** When true, verify each dev.local hostname with a Mongo TLS connection. */
  verifyMongoTls?: boolean;
}): Promise<void> {
  const {mongoRunConfig, mode, logger, verifyMongoTls = false} = params;
  const hostnames = collectMongoReplicaSetHostnames(mongoRunConfig);
  const hostnamePorts = collectMongoReplicaSetHostnamePorts(mongoRunConfig);

  await ensureHostnamesResolvable({
    hostnames,
    hostnamePorts,
    ip: resolveMongoEtcHostsIp(mongoRunConfig.etcHostsIp),
    mode: mode ?? mongoRunConfig.etcHostsSetup ?? 'prompt',
    logger,
  });

  if (!verifyMongoTls) {
    return;
  }

  const reachable = await checkMongoInstancesListening({
    mongoRunConfig,
    logger,
    preferLocalhost: false,
    retries: 3,
  });
  if (!reachable) {
    throw new Error(
      'Replica set hostnames are not reachable via Mongo TLS after /etc/hosts setup'
    );
  }
}
