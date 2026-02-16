import {execFileSync} from 'child_process';
import crypto from 'crypto';
import {ensureDir} from 'fs-extra';
import {chmod} from 'fs/promises';
import path from 'path';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {
  assertMongoInstanceListening,
  assertMongoInstancesListening,
  assertMongoReplicaSetReady,
  waitForMemberState,
} from './checkMongoReadyState.js';
import {getInstanceRunName} from './constants.js';
import {getMongoCertOutDir} from './generateMongoCertConfigs.js';
import {
  generateMongoDockerConfigForMongod,
  getMongodConfigDir,
  getMongodDataDir,
  getMongodDockerConfigFilePath,
  getMongodSystemLogFilePath,
} from './generateMongodConfigs.js';
import {
  extractHostnamesForDockerBinding,
  MongoRunConfig,
} from './mongoRunConfig.js';
import {findAdminUser} from './user/findUtils.js';

const kDefaultMongoVersion = '8.2.3';
const kConfigHashLabel = 'forerunner.configHash';

/** Docker bridge IP: host as seen from inside containers; used so containers
 * can reach each other via host port mappings. */
const kDockerBridgeIp = '172.17.0.1';

/**
 * Fingerprint of everything that affects `docker run` (ports, volumes, env, etc.).
 * When reusing a stopped container, we only reuse if this matches the container's
 * label; otherwise we remove the old container and create a new one so config
 * changes (e.g. port) are applied.
 */
function getRunConfigFingerprint(params: {
  port: number;
  image: string;
  dataDir: string;
  systemLogDir: string;
  certsDir: string;
  configDir: string;
  nonLocalhostHostnames: string[];
  initEnv?: {username: string; password: string};
}): string {
  const {
    port,
    image,
    dataDir,
    systemLogDir,
    certsDir,
    configDir,
    nonLocalhostHostnames,
    initEnv,
  } = params;
  const payload = JSON.stringify({
    port,
    image,
    dataDir: path.resolve(dataDir),
    systemLogDir: path.resolve(systemLogDir),
    certsDir: path.resolve(certsDir),
    configDir: path.resolve(configDir),
    addHost: [...nonLocalhostHostnames].sort(),
    initUser: initEnv ? {u: initEnv.username, p: initEnv.password} : null,
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function getContainerConfigHash(containerName: string): string | null {
  try {
    const out = execFileSync(
      'docker',
      [
        'inspect',
        '-f',
        `{{index .Config.Labels "${kConfigHashLabel}"}}`,
        containerName,
      ],
      {stdio: 'pipe', encoding: 'utf8'}
    );
    const value = out.trim();
    return value || null;
  } catch {
    return null;
  }
}

function removeContainer(containerName: string, logger: IForeLogger): void {
  try {
    execFileSync('docker', ['rm', '-f', containerName], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    logger.log(`Removed existing container ${containerName} (config changed).`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to remove container ${containerName}: ${msg}`);
  }
}

async function waitForInstanceIfRequested(params: {
  instanceRunName: string;
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  waitUntilListening?: boolean;
  waitUntilReplicaSetReady?: boolean;
}): Promise<void> {
  const {
    instanceRunName,
    instanceNumber,
    mongoRunConfig,
    logger,
    waitUntilListening,
    waitUntilReplicaSetReady,
  } = params;
  if (waitUntilListening) {
    logger.log(`Waiting for ${instanceRunName} to begin listening...`);
    await assertMongoInstanceListening({
      mongoRunConfig,
      instanceNumber,
      logger,
    });
  }
  if (waitUntilReplicaSetReady) {
    logger.log(
      `Waiting for ${instanceRunName} to reach PRIMARY or SECONDARY state...`
    );
    await waitForMemberState({
      instanceNumber,
      mongoRunConfig,
      logger,
    });
  }
}

function getNonLocalhostInstanceHostnames(
  mongoRunConfig: MongoRunConfig
): string[] {
  const seen = new Set<string>();
  for (let i = 0; i < mongoRunConfig.instancesHostnames.length; i++) {
    const entry = mongoRunConfig.instancesHostnames[i];
    if (!entry) continue;
    // Only bind hostnames to Docker bridge if resolution is missing or 'local' (not 'dns')
    const hostnamesForBinding = extractHostnamesForDockerBinding(entry);
    for (const h of hostnamesForBinding) {
      seen.add(h);
    }
  }
  return Array.from(seen);
}

export function getDockerContainerName(
  mongoRunConfig: MongoRunConfig,
  instanceNumber: number
): string {
  if (mongoRunConfig.containerName) {
    return `${mongoRunConfig.containerName}-mongod-${instanceNumber}`;
  }
  const hash = crypto
    .createHash('sha256')
    .update(path.resolve(mongoRunConfig.workingDir))
    .digest('hex')
    .slice(0, 12);
  return `mongo-${hash}-mongod-${instanceNumber}`;
}

function ensureDockerAvailable(): void {
  try {
    execFileSync('docker', ['info'], {stdio: 'pipe', encoding: 'utf8'});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Docker is not available. Please ensure Docker is installed and running: ${msg}`
    );
  }
}

function containerExists(containerName: string): boolean {
  try {
    execFileSync('docker', ['inspect', '-f', '{{.Id}}', containerName], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

function isContainerRunning(containerName: string): boolean {
  try {
    const out = execFileSync(
      'docker',
      ['inspect', '-f', '{{.State.Running}}', containerName],
      {stdio: 'pipe', encoding: 'utf8'}
    );
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

export async function startMongodInstance(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  waitUntilListening?: boolean;
  waitUntilReplicaSetReady?: boolean;
  shouldInitDbRootUser?: boolean;
}) {
  const {
    instanceNumber,
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    waitUntilListening = false,
    waitUntilReplicaSetReady = false,
    shouldInitDbRootUser = false,
  } = params;

  const instanceRunName = getInstanceRunName(instanceNumber);
  const containerName = getDockerContainerName(mongoRunConfig, instanceNumber);
  const port = mongoRunConfig.instancePorts[instanceNumber - 1];
  const dataDir = getMongodDataDir(mongoRunConfig, instanceNumber);
  const systemLogPath = getMongodSystemLogFilePath(
    mongoRunConfig,
    instanceNumber
  );
  const systemLogDir = path.dirname(systemLogPath);
  const certsDir = getMongoCertOutDir(mongoRunConfig);
  const configDir = getMongodConfigDir(mongoRunConfig);
  const imageTag = mongoRunConfig.mongoVersion ?? kDefaultMongoVersion;
  // Use official mongo image from Docker Hub
  const image = `mongo:${imageTag}`;

  await ensureDir(dataDir);
  await ensureDir(systemLogDir);
  await ensureDir(configDir);
  // Mongo container runs as user 'mongodb' (UID 999); make data and log dirs
  // writable so it can create files.
  await chmod(path.resolve(dataDir), 0o777);
  await chmod(path.resolve(systemLogDir), 0o777);
  await generateMongoDockerConfigForMongod({
    instanceNumber,
    mongoRunConfig,
  });

  logger.log('Data dir:', path.resolve(mongoRunConfig.workingDir, dataDir));
  logger.log(
    'System log dir:',
    path.resolve(mongoRunConfig.workingDir, systemLogDir)
  );
  logger.log('Certs dir:', path.resolve(mongoRunConfig.workingDir, certsDir));
  logger.log('Config dir:', path.resolve(mongoRunConfig.workingDir, configDir));

  const nonLocalhostHostnames =
    getNonLocalhostInstanceHostnames(mongoRunConfig);

  const initEnv = shouldInitDbRootUser
    ? (() => {
        const adminUser = findAdminUser({
          users: mongoRunConfig.users,
          isRequired: true,
        });
        return {username: adminUser.username, password: adminUser.password};
      })()
    : undefined;

  const configFingerprint = getRunConfigFingerprint({
    port,
    image,
    dataDir,
    systemLogDir: systemLogDir,
    certsDir,
    configDir,
    nonLocalhostHostnames,
    initEnv,
  });

  const runArgs: string[] = [
    'run',
    '-d',
    '--name',
    containerName,
    '--label',
    `${kConfigHashLabel}=${configFingerprint}`,
    ...nonLocalhostHostnames.flatMap(hostname => [
      '--add-host',
      `${hostname}:${kDockerBridgeIp}`,
    ]),
    '-p',
    // `${port}:27017`,
    `${port}:${port}`,
    '-v',
    `${path.resolve(dataDir)}:/data/db`,
    '-v',
    `${path.resolve(systemLogDir)}:/var/log/mongodb`,
    '-v',
    `${path.resolve(certsDir)}:/certs:ro`,
    '-v',
    `${path.resolve(configDir)}:/etc/mongodb:ro`,
  ];

  if (initEnv) {
    runArgs.push('-e', `MONGO_INITDB_ROOT_USERNAME=${initEnv.username}`);
    runArgs.push('-e', `MONGO_INITDB_ROOT_PASSWORD=${initEnv.password}`);
  }

  runArgs.push(image);

  const dockerConfigFilename = path.basename(
    getMongodDockerConfigFilePath(mongoRunConfig, instanceNumber)
  );
  const mongodArgs: string[] = [
    'mongod',
    '--config',
    `/etc/mongodb/${dockerConfigFilename}`,
  ];

  runArgs.push(...mongodArgs);

  if (containerExists(containerName)) {
    const existingHash = getContainerConfigHash(containerName);
    const configChanged =
      existingHash === null || existingHash !== configFingerprint;

    if (configChanged) {
      logger.log(
        `Config changed for ${instanceRunName} (container ${containerName}); removing and recreating.`
      );
      removeContainer(containerName, logger);
      // Fall through to create new container below.
    } else if (isContainerRunning(containerName)) {
      logger.log(
        `${instanceRunName} (container ${containerName}) is already running; skipping start`
      );
      await waitForInstanceIfRequested({
        instanceRunName,
        instanceNumber,
        mongoRunConfig,
        logger,
        waitUntilListening,
        waitUntilReplicaSetReady,
      });
      return;
    } else {
      // Same config, container stopped — start it
      logger.log(
        `${instanceRunName} (container ${containerName}) exists but is not running; starting it...`
      );
      try {
        execFileSync('docker', ['start', containerName], {
          stdio: 'inherit',
          encoding: 'utf8',
        });
        logger.log(`Started existing container ${containerName}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to start existing Docker container ${containerName}: ${msg}`
        );
      }
      await waitForInstanceIfRequested({
        instanceRunName,
        instanceNumber,
        mongoRunConfig,
        logger,
        waitUntilListening,
        waitUntilReplicaSetReady,
      });
      return;
    }
  }

  {
    // Check if image exists, if not it will be pulled automatically by Docker
    logger.log('Instance run name:', instanceRunName);
    logger.log('Container name:', containerName);
    logger.log('Image:', image);
    logger.log('Starting mongod via Docker...');

    try {
      execFileSync('docker', runArgs, {
        stdio: 'inherit',
        encoding: 'utf8',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to start Docker container ${containerName}: ${msg}`
      );
    }
  }

  await waitForInstanceIfRequested({
    instanceRunName,
    instanceNumber,
    mongoRunConfig,
    logger,
    waitUntilListening,
    waitUntilReplicaSetReady,
  });
}

export async function startMongodInstancesMain(params: {
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
  waitUntilListening?: boolean;
  waitUntilReplicaSetReady?: boolean;
  shouldInitDbRootUser?: boolean;
}) {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    waitUntilListening,
    waitUntilReplicaSetReady,
    shouldInitDbRootUser,
  } = params;

  ensureDockerAvailable();

  for (let i = 1; i <= mongoRunConfig.instancePorts.length; i++) {
    await startMongodInstance({
      instanceNumber: i,
      mongoRunConfig,
      logger,
      shouldInitDbRootUser,
    });
  }

  if (waitUntilListening) {
    logger.log('Waiting for Mongo instances to begin listening...');
    await assertMongoInstancesListening({mongoRunConfig, logger});
  }

  if (waitUntilReplicaSetReady) {
    logger.log('Waiting for replica set to be ready...');
    await assertMongoReplicaSetReady({mongoRunConfig, logger});
  }
}
