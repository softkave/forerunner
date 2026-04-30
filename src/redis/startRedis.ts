import {execFile} from 'child_process';
import crypto from 'crypto';
import {ensureDir} from 'fs-extra';
import path from 'path';
import {promisify} from 'util';
import {
  containerExists,
  ensureDockerAvailable,
  ensureNetwork,
  ensureVolume,
  execInContainer,
  isContainerRunning,
} from '../utils/docker.js';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {spawnInherit} from '../utils/spawnInherit.js';
import {getRedisNetworkName} from './dockerNetName.js';
import {generateRedisCertsMain} from './generateRedisCerts.js';
import {writeRedisNodeConf, writeSentinelConf} from './generateRedisConf.js';
import {getRedisCertOutDir, getRedisOutDir} from './paths.js';
import {ensureRedisPassword, RedisRunConfig} from './redisRunConfig.js';
import {getRedisTopology, RedisTopology} from './topology.js';
import {buildRedisCliArgs} from './redisCli.js';

const execFileAsync = promisify(execFile);

const kConfigHashLabel = 'forerunner.configHash';

function fingerprint(payload: unknown) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 16);
}

// Volume/network management and redis-cli argument building are centralized.

async function waitForRedisPing(params: {
  containerName: string;
  redisRunConfig: RedisRunConfig;
  port: number;
  password?: string;
  logger: IForeLogger;
  maxAttempts?: number;
  retryIntervalMs?: number;
}) {
  const {
    containerName,
    redisRunConfig,
    port,
    password,
    logger,
    maxAttempts = 30,
    retryIntervalMs = 500,
  } = params;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const out = await execInContainer(containerName, [
        'redis-cli',
        ...buildRedisCliArgs({redisRunConfig, port, password}),
        'PING',
      ]);
      if (String(out).trim().toUpperCase() === 'PONG') return;
    } catch {
      // ignore
    }
    await new Promise(r => setTimeout(r, retryIntervalMs));
  }
  throw new Error(
    `Redis in container ${containerName} did not respond to PING`
  );
}

async function getContainerConfigHash(
  containerName: string
): Promise<string | null> {
  try {
    const {stdout} = await execFileAsync(
      'docker',
      [
        'inspect',
        '-f',
        `{{index .Config.Labels "${kConfigHashLabel}"}}`,
        containerName,
      ],
      {encoding: 'utf8'}
    );
    const v = String(stdout).trim();
    return v || null;
  } catch {
    return null;
  }
}

async function removeContainer(containerName: string, logger: IForeLogger) {
  try {
    await execFileAsync('docker', ['rm', '-f', '-v', containerName], {
      encoding: 'utf8',
    });
    logger.log(`Removed existing container ${containerName} (config changed).`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to remove container ${containerName}: ${msg}`);
  }
}

async function startRedisNode(params: {
  redisRunConfig: RedisRunConfig;
  nodeName: string;
  port: number;
  volumeName: string;
  password?: string;
  replicaOf?: {host: string; port: number};
  clusterEnabled?: boolean;
  networkName: string;
  logger: IForeLogger;
}) {
  const {
    redisRunConfig,
    nodeName,
    port,
    volumeName,
    password,
    replicaOf,
    clusterEnabled,
    networkName,
    logger,
  } = params;

  const image = `redis:${redisRunConfig.redisVersion}`;
  await ensureVolume({volumeName, keep: redisRunConfig.keep});

  // Generate per-node redis.conf
  const {filepath: confPath} = await writeRedisNodeConf({
    redisRunConfig,
    nodeName,
    port,
    replicaOf,
    clusterEnabled,
    password,
  });

  const discoverability = redisRunConfig.discoverability ?? 'local';
  const portMapping =
    discoverability === 'local'
      ? `127.0.0.1:${port}:${port}`
      : `${port}:${port}`;

  const certsDir = getRedisCertOutDir(redisRunConfig);

  const fp = fingerprint({
    image,
    port,
    portMapping,
    volumeName,
    confPath: path.resolve(confPath),
    tls: redisRunConfig.tls,
    certsDir: redisRunConfig.tls === 'enabled' ? path.resolve(certsDir) : '',
    labels: redisRunConfig.labels ?? null,
    replicaOf: replicaOf ?? null,
    clusterEnabled: clusterEnabled ?? false,
  });

  const runArgs: string[] = [
    'run',
    '-d',
    '--name',
    nodeName,
    '--network',
    networkName,
    '--label',
    `${kConfigHashLabel}=${fp}`,
    ...(redisRunConfig.labels
      ? Object.entries(redisRunConfig.labels).flatMap(([k, v]) => [
          '--label',
          `${k}=${v}`,
        ])
      : []),
    '-p',
    portMapping,
    '-v',
    `${volumeName}:/data`,
    '-v',
    `${path.resolve(confPath)}:/usr/local/etc/redis/redis.conf:ro`,
  ];

  if (redisRunConfig.tls === 'enabled') {
    runArgs.push('-v', `${path.resolve(certsDir)}:/certs:ro`);
  }

  runArgs.push(image, 'redis-server', '/usr/local/etc/redis/redis.conf');

  if (await containerExists(nodeName)) {
    const existingHash = await getContainerConfigHash(nodeName);
    const configChanged = existingHash === null || existingHash !== fp;
    if (configChanged) {
      await removeContainer(nodeName, logger);
    } else if (await isContainerRunning(nodeName)) {
      logger.log(`${nodeName} is already running; skipping start`);
      return;
    } else {
      logger.log(`${nodeName} exists but is stopped; starting it...`);
      await spawnInherit('docker', ['start', nodeName]);
      return;
    }
  }

  logger.log(`Starting ${nodeName}...`);
  await spawnInherit('docker', runArgs);
}

async function startSentinel(params: {
  redisRunConfig: RedisRunConfig;
  sentinelName: string;
  sentinelPort: number;
  volumeName: string;
  networkName: string;
  masterName: string;
  masterHost: string;
  masterPort: number;
  quorum: number;
  downAfterMs: number;
  failoverTimeoutMs: number;
  password?: string;
  logger: IForeLogger;
}) {
  const {
    redisRunConfig,
    sentinelName,
    sentinelPort,
    volumeName,
    networkName,
    masterName,
    masterHost,
    masterPort,
    quorum,
    downAfterMs,
    failoverTimeoutMs,
    password,
    logger,
  } = params;

  const image = `redis:${redisRunConfig.redisVersion}`;
  await ensureVolume({volumeName, keep: redisRunConfig.keep});

  const {filepath: confPath} = await writeSentinelConf({
    redisRunConfig,
    sentinelName,
    sentinelPort,
    masterName,
    masterHost,
    masterPort,
    quorum,
    downAfterMs,
    failoverTimeoutMs,
    password,
  });

  const discoverability = redisRunConfig.discoverability ?? 'local';
  const portMapping =
    discoverability === 'local'
      ? `127.0.0.1:${sentinelPort}:${sentinelPort}`
      : `${sentinelPort}:${sentinelPort}`;

  const fp = fingerprint({
    image,
    sentinelPort,
    portMapping,
    volumeName,
    confPath: path.resolve(confPath),
    masterHost,
    masterPort,
    quorum,
    downAfterMs,
    failoverTimeoutMs,
    labels: redisRunConfig.labels ?? null,
  });

  const runArgs: string[] = [
    'run',
    '-d',
    '--name',
    sentinelName,
    '--network',
    networkName,
    '--label',
    `${kConfigHashLabel}=${fp}`,
    ...(redisRunConfig.labels
      ? Object.entries(redisRunConfig.labels).flatMap(([k, v]) => [
          '--label',
          `${k}=${v}`,
        ])
      : []),
    '-p',
    portMapping,
    '-v',
    `${volumeName}:/data`,
    '-v',
    `${path.resolve(confPath)}:/usr/local/etc/redis/sentinel.conf:ro`,
    image,
    'redis-server',
    '/usr/local/etc/redis/sentinel.conf',
    '--sentinel',
  ];

  if (await containerExists(sentinelName)) {
    const existingHash = await getContainerConfigHash(sentinelName);
    const configChanged = existingHash === null || existingHash !== fp;
    if (configChanged) {
      await removeContainer(sentinelName, logger);
    } else if (await isContainerRunning(sentinelName)) {
      logger.log(`${sentinelName} is already running; skipping start`);
      return;
    } else {
      logger.log(`${sentinelName} exists but is stopped; starting it...`);
      await spawnInherit('docker', ['start', sentinelName]);
      return;
    }
  }

  logger.log(`Starting ${sentinelName}...`);
  await spawnInherit('docker', runArgs);
}

async function ensureConfigsFolders(redisRunConfig: RedisRunConfig) {
  await ensureDir(getRedisOutDir(redisRunConfig));
  if (redisRunConfig.tls === 'enabled') {
    await ensureDir(getRedisCertOutDir(redisRunConfig));
  }
}

async function bootstrapCluster(params: {
  redisRunConfig: RedisRunConfig;
  topology: RedisTopology;
  password?: string;
  logger: IForeLogger;
}) {
  const {redisRunConfig, topology, password, logger} = params;
  if (topology.mode !== 'cluster') return;

  const nodeAddrs = topology.nodes.map(n => `${n.name}:${n.port}`);
  const first = topology.nodes[0];
  if (!first) throw new Error('Cluster topology has no nodes');

  // Check if cluster is already configured
  try {
    const info = await execInContainer(first.name, [
      'redis-cli',
      ...buildRedisCliArgs({redisRunConfig, port: first.port, password}),
      'CLUSTER',
      'INFO',
    ]);
    if (String(info).includes('cluster_state:ok')) {
      logger.log('Redis Cluster already configured (cluster_state:ok)');
      return;
    }
  } catch {
    // ignore and proceed
  }

  const replicasPerMaster =
    redisRunConfig.mode === 'cluster' ? redisRunConfig.replicasPerMaster : 1;

  logger.log('Bootstrapping Redis Cluster...');
  const cmd = [
    'redis-cli',
    ...(redisRunConfig.tls === 'enabled'
      ? ['--tls', '--cacert', '/certs/ca.crt.pem']
      : []),
    ...(redisRunConfig.auth === 'enabled' && password ? ['-a', password] : []),
    '--cluster',
    'create',
    ...nodeAddrs,
    '--cluster-replicas',
    String(replicasPerMaster),
    '--cluster-yes',
  ];

  await spawnInherit('docker', ['exec', first.name, ...cmd]);

  // Verify
  const infoAfter = await execInContainer(first.name, [
    'redis-cli',
    ...buildRedisCliArgs({redisRunConfig, port: first.port, password}),
    'CLUSTER',
    'INFO',
  ]);
  if (!String(infoAfter).includes('cluster_state:ok')) {
    throw new Error('Cluster bootstrap did not result in cluster_state:ok');
  }
}

export async function startRedisMain(params: {
  redisRunConfig: RedisRunConfig;
  logger?: IForeLogger;
  waitUntilListening?: boolean;
}) {
  const {
    redisRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    waitUntilListening = true,
  } = params;

  await ensureDockerAvailable();
  await ensureConfigsFolders(redisRunConfig);

  const networkName = getRedisNetworkName({
    workingDir: path.resolve(redisRunConfig.workingDir),
  });
  await ensureNetwork(networkName);

  const topology = getRedisTopology(redisRunConfig);

  const pwRes = await ensureRedisPassword({redisRunConfig});
  const updatedConfig = pwRes.redisRunConfig;
  const password = pwRes.password;

  // Generate certs if TLS enabled
  if (updatedConfig.tls === 'enabled') {
    await generateRedisCertsMain({
      redisRunConfig: updatedConfig,
      overwriteConfig: false,
      overwriteCA: false,
      overwriteCerts: false,
      logger,
    });
  }

  // Start nodes
  for (const node of topology.nodes) {
    await startRedisNode({
      redisRunConfig: updatedConfig,
      nodeName: node.name,
      port: node.port,
      volumeName: node.volumeName,
      password,
      replicaOf: node.replicaOf,
      clusterEnabled: node.clusterEnabled,
      networkName,
      logger,
    });
  }

  // Start sentinels (after master exists)
  if (topology.mode === 'sentinel') {
    for (const s of topology.sentinels) {
      await startSentinel({
        redisRunConfig: updatedConfig,
        sentinelName: s.name,
        sentinelPort: s.port,
        volumeName: s.volumeName,
        networkName,
        masterName: topology.masterName,
        masterHost: topology.masterName,
        masterPort: topology.nodes[0]!.port,
        quorum: updatedConfig.quorum,
        downAfterMs: updatedConfig.downAfterMs,
        failoverTimeoutMs: updatedConfig.failoverTimeoutMs,
        password,
        logger,
      });
    }
  }

  // Wait for readiness
  if (waitUntilListening) {
    for (const node of topology.nodes) {
      await waitForRedisPing({
        containerName: node.name,
        redisRunConfig: updatedConfig,
        port: node.port,
        password,
        logger,
      });
    }
    if (topology.mode === 'sentinel') {
      for (const s of topology.sentinels) {
        await waitForRedisPing({
          containerName: s.name,
          redisRunConfig: updatedConfig,
          port: s.port,
          password: undefined, // sentinel port itself is not protected by requirepass typically
          logger,
        });
      }
    }
  }

  // Bootstrap cluster if needed
  await bootstrapCluster({
    redisRunConfig: updatedConfig,
    topology,
    password,
    logger,
  });
}
