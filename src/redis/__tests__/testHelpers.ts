import getPort from 'get-port';
import net from 'node:net';
import {isContainerRunning} from '../../utils/docker.js';
import {ConsoleForeLogger} from '../../utils/foreLogger/ConsoleForeLogger.js';
import {RedisRunConfig} from '../redisRunConfig.js';
import {stopRedisMain} from '../stopRedis.js';

const logger = new ConsoleForeLogger({silent: true});

/**
 * Stop Redis containers, remove volumes when requested, and remove the Docker
 * network derived from `workingDir`.
 */
export async function cleanupRedisTest(params: {
  redisRunConfig: RedisRunConfig;
  removeVolumes?: boolean;
}) {
  const {redisRunConfig, removeVolumes = true} = params;
  await stopRedisMain({
    redisRunConfig,
    logger,
    removeVolumes,
  });
}

export async function waitUntilContainerStopped(
  containerName: string,
  timeoutMs = 20000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isContainerRunning(containerName))) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(
    `Container ${containerName} did not stop within ${timeoutMs}ms`
  );
}

export async function isTcpPortFree(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({port, host: '127.0.0.1'}, () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * Find `count` consecutive free TCP ports on 127.0.0.1 (for cluster
 * `basePort`, `basePort+1`, …).
 */
export async function getConsecutiveFreePorts(count: number): Promise<number> {
  for (let attempt = 0; attempt < 80; attempt++) {
    const base = await getPort({host: '127.0.0.1'});
    let allFree = true;
    for (let i = 1; i < count; i++) {
      if (!(await isTcpPortFree(base + i))) {
        allFree = false;
        break;
      }
    }
    if (allFree) return base;
  }
  throw new Error(
    `Could not find ${count} consecutive free TCP ports on 127.0.0.1`
  );
}

async function takeDistinctPort(forbidden: Set<number>): Promise<number> {
  for (let attempt = 0; attempt < 120; attempt++) {
    const p = await getPort({host: '127.0.0.1'});
    if (!forbidden.has(p)) {
      forbidden.add(p);
      return p;
    }
  }
  throw new Error('Could not allocate a distinct TCP port');
}

/**
 * Reserve a base port such that `base`, `base+1`, … `base+replicas-1` are free
 * and not in `forbidden`; then add those ports to `forbidden`.
 */
async function takeReplicaBasePort(
  replicas: number,
  forbidden: Set<number>
): Promise<number> {
  for (let attempt = 0; attempt < 80; attempt++) {
    const base = await getPort({host: '127.0.0.1'});
    let ok = true;
    for (let i = 0; i < replicas; i++) {
      const p = base + i;
      if (forbidden.has(p) || !(await isTcpPortFree(p))) {
        ok = false;
        break;
      }
    }
    if (ok) {
      for (let i = 0; i < replicas; i++) forbidden.add(base + i);
      return base;
    }
  }
  throw new Error(
    `Could not allocate ${replicas} replica port(s) without collisions`
  );
}

/**
 * Non-overlapping ports for sentinel mode: master, replica range, and
 * consecutive sentinel ports (`sentinelBasePort` … `+ sentinels - 1`).
 */
export async function allocateSentinelPorts(params: {
  replicas: number;
  sentinels: number;
}): Promise<{
  masterPort: number;
  replicaBasePort: number;
  sentinelBasePort: number;
}> {
  const {replicas, sentinels} = params;
  const forbidden = new Set<number>();
  const masterPort = await takeDistinctPort(forbidden);
  const replicaBasePort = await takeReplicaBasePort(replicas, forbidden);
  const sentinelBasePort = await takeReplicaBasePort(sentinels, forbidden);
  return {masterPort, replicaBasePort, sentinelBasePort};
}
