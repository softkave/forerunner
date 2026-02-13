import {execFileSync} from 'child_process';
import crypto from 'crypto';
import {ensureDir} from 'fs-extra';
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
import {MongoRunConfig} from './mongoRunConfig.js';
import {findAdminUser} from './user/findUtils.js';
import {extractHostnamesForDockerBinding} from './mongoRunConfig.js';

const kDefaultMongoVersion = '8.2.3';

/** Docker bridge IP: host as seen from inside containers; used so containers
 * can reach each other via host port mappings. */
const kDockerBridgeIp = '172.17.0.1';

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
  } catch {
    throw new Error(
      'Docker is not available. Please ensure Docker is installed and running.'
    );
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
  const image = `mongo:${imageTag}`;

  await ensureDir(dataDir);
  await ensureDir(systemLogDir);
  await ensureDir(configDir);
  await generateMongoDockerConfigForMongod({
    instanceNumber,
    mongoRunConfig,
  });

  const adminUser = findAdminUser({
    users: mongoRunConfig.users,
    isRequired: false,
  });

  const nonLocalhostHostnames =
    getNonLocalhostInstanceHostnames(mongoRunConfig);

  const runArgs: string[] = [
    'run',
    '-d',
    '--name',
    containerName,
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

  if (
    shouldInitDbRootUser &&
    mongoRunConfig.authorization !== 'disabled' &&
    adminUser?.username &&
    adminUser?.password
  ) {
    runArgs.push('-e', `MONGO_INITDB_ROOT_USERNAME=${adminUser.username}`);
    runArgs.push('-e', `MONGO_INITDB_ROOT_PASSWORD=${adminUser.password}`);
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

  if (isContainerRunning(containerName)) {
    logger.log(
      `${instanceRunName} (container ${containerName}) is already running; skipping start`
    );
  } else {
    logger.log('Instance run name:', instanceRunName);
    logger.log('Container name:', containerName);
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
