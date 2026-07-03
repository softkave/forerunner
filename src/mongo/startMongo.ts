import {execFile} from 'child_process';
import crypto from 'crypto';
import {ensureDir} from 'fs-extra';
import path from 'path';
import {promisify} from 'util';
import {
  containerExists,
  ensureDockerAvailable,
  ensureDockerNetwork,
  isContainerRunning,
} from '../utils/docker.js';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {resolveWorkingDir} from '../utils/resolvePathUnderWorkingDir.js';
import {spawnInherit} from '../utils/spawnInherit.js';
import {
  assertMongoInstanceListening,
  assertMongoInstancesListening,
  assertMongoReplicaSetReady,
  waitForMemberState,
} from './checkMongoReadyState.js';
import {getInstanceRunName} from './constants.js';
import {ensureMongoHostnamesResolvable} from './ensureMongoHostnamesResolvable.js';
import {
  ensureMongoSslCertPermissions,
  resolveMongoCertOutDir,
} from './generateMongoCertConfigs.js';
import {ensureMongoCertificates} from './generateMongoCerts.js';
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
import {printMongoUriMain} from './printMongoUri.js';
import {setupReplicaSet} from './setupReplicaSet.js';
import {findAdminUser, findClusterAdminUser} from './user/findUtils.js';
import {setupMongoUsers, setupUser} from './user/setupUsers.js';

const kDefaultMongoVersion = '8.2.3';
const kConfigHashLabel = 'forerunner.configHash';

const execFileAsync = promisify(execFile);

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
  labels?: Record<string, string>;
  dockerNetwork?: string;
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
    labels,
    dockerNetwork,
  } = params;

  const payload = JSON.stringify({
    port,
    image,
    dataDir,
    systemLogDir,
    configDir,
    certsDir: certsDir ?? '',
    addHost: [...nonLocalhostHostnames].sort(),
    initUser: initEnv ? {u: initEnv.username, p: initEnv.password} : null,
    labels: labels
      ? Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))
      : null,
    dockerNetwork: dockerNetwork ?? null,
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
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
    const value = String(stdout).trim();
    return value || null;
  } catch {
    return null;
  }
}

async function removeContainer(
  containerName: string,
  logger: IForeLogger
): Promise<void> {
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
  for (let i = 0; i < mongoRunConfig.hostnames.length; i++) {
    const entry = mongoRunConfig.hostnames[i];
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
    .update(resolveWorkingDir(mongoRunConfig.workingDir))
    .digest('hex')
    .slice(0, 12);
  return `mongo-${hash}-mongod-${instanceNumber}`;
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
  const port = mongoRunConfig.ports[instanceNumber - 1];
  const dataDir = getMongodDataDir(mongoRunConfig, instanceNumber);
  const systemLogPath = getMongodSystemLogFilePath(
    mongoRunConfig,
    instanceNumber
  );
  const systemLogDir = path.dirname(systemLogPath);
  const certsDir = await resolveMongoCertOutDir(mongoRunConfig);
  const configDir = getMongodConfigDir(mongoRunConfig);
  const imageTag = mongoRunConfig.mongoVersion ?? kDefaultMongoVersion;
  // Use official mongo image from Docker Hub
  const image = `mongo:${imageTag}`;

  await ensureDir(dataDir);
  await ensureDir(systemLogDir);
  await ensureDir(configDir);
  // Mongo container runs as user 'mongodb' (UID 999); make data and log dirs
  // writable so it can create files.
  // await chmod(dataDir, 0o777);
  // await chmod(systemLogDir, 0o777);
  await generateMongoDockerConfigForMongod({
    instanceNumber,
    mongoRunConfig,
  });

  logger.log('Data dir:', dataDir);
  logger.log('System log dir:', systemLogDir);
  logger.log('Certs dir:', certsDir);
  logger.log('Config dir:', configDir);

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
    certsDir,
    configDir,
    nonLocalhostHostnames,
    initEnv,
    systemLogDir,
    labels: mongoRunConfig.labels,
    dockerNetwork: mongoRunConfig.dockerNetwork,
  });

  const runArgs: string[] = [
    'run',
    '-d',
    '--name',
    containerName,
    '--label',
    `${kConfigHashLabel}=${configFingerprint}`,
    ...(mongoRunConfig.dockerNetwork
      ? ['--network', mongoRunConfig.dockerNetwork]
      : []),
    ...(mongoRunConfig.labels
      ? Object.entries(mongoRunConfig.labels).flatMap(([k, v]) => [
          '--label',
          `${k}=${v}`,
        ])
      : []),
    ...nonLocalhostHostnames.flatMap(hostname => [
      '--add-host',
      `${hostname}:${kDockerBridgeIp}`,
    ]),
    '-p',
    `${port}:${port}`,
    '-v',
    `${dataDir}:/data/db`,
    '-v',
    `${systemLogDir}:/var/log/mongodb`,
    '-v',
    `${certsDir}:/certs:ro`,
    '-v',
    `${configDir}:/etc/mongodb:ro`,
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

  if (await containerExists(containerName)) {
    const existingHash = await getContainerConfigHash(containerName);
    const configChanged =
      existingHash === null || existingHash !== configFingerprint;

    if (configChanged) {
      logger.log(
        `Config changed for ${instanceRunName} (container ${containerName}); removing and recreating.`
      );
      await removeContainer(containerName, logger);
      // Fall through to create new container below.
    } else if (await isContainerRunning(containerName)) {
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
        await spawnInherit('docker', ['start', containerName]);
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
      await spawnInherit('docker', runArgs);
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

export async function startMongoMain(params: {
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
  waitUntilListening?: boolean;
  waitUntilReplicaSetReady?: boolean;
  shouldInitDbRootUser?: boolean;
  shouldSetupReplicaSet?: boolean;
  shouldSetupUsers?: boolean;
  etcHostsSetup?: MongoRunConfig['etcHostsSetup'];
  printUri?: boolean;
}) {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    waitUntilListening = true,
    waitUntilReplicaSetReady = true,
    shouldInitDbRootUser = true,
    shouldSetupReplicaSet = true,
    shouldSetupUsers = false,
    etcHostsSetup,
    printUri = true,
  } = params;

  await ensureDockerAvailable();

  if (mongoRunConfig.dockerNetwork) {
    await ensureDockerNetwork(mongoRunConfig.dockerNetwork);
  }

  // Generate certificates if not already present
  await ensureMongoCertificates({mongoRunConfig, logger});
  await ensureMongoSslCertPermissions(mongoRunConfig);

  for (let i = 1; i <= mongoRunConfig.ports.length; i++) {
    await startMongodInstance({
      instanceNumber: i,
      mongoRunConfig,
      logger,
      shouldInitDbRootUser:
        shouldInitDbRootUser && mongoRunConfig.authorization !== 'disabled',
    });
  }

  if (waitUntilListening) {
    logger.log('Waiting for Mongo instances to begin listening...');
    await assertMongoInstancesListening({
      mongoRunConfig,
      logger,
      preferLocalhost: true,
    });
  }

  // Setup replica set if requested (default: true)
  if (shouldSetupReplicaSet) {
    await ensureMongoHostnamesResolvable({
      mongoRunConfig,
      mode: etcHostsSetup,
      logger,
      verifyMongoTls: true,
    });

    const authRequired = mongoRunConfig.authorization !== 'disabled';
    const adminUser = findAdminUser({
      users: mongoRunConfig.users,
      isRequired: authRequired,
    });
    const clusterAdminUser = findClusterAdminUser({
      users: mongoRunConfig.users,
      isRequired: authRequired,
    });
    await setupReplicaSet({
      mongoRunConfig,
      logger,
      adminUser,
      clusterAdminUser,
    });

    await ensureMongoHostnamesResolvable({
      mongoRunConfig,
      mode: 'skip',
      logger,
      verifyMongoTls: true,
    });

    // After setting up replica set, always assert it's ready
    logger.log('Waiting for replica set to be ready...');
    await assertMongoReplicaSetReady({
      mongoRunConfig,
      logger,
      preferLocalhost: false,
      authUser: adminUser
        ? {
            username: adminUser.username,
            password: adminUser.password,
          }
        : undefined,
    });
  } else if (waitUntilReplicaSetReady) {
    // If not setting up but waiting was explicitly requested, assert ready
    const authRequired = mongoRunConfig.authorization !== 'disabled';
    const adminUser = findAdminUser({
      users: mongoRunConfig.users,
      isRequired: authRequired,
    });
    logger.log('Waiting for replica set to be ready...');
    await assertMongoReplicaSetReady({
      mongoRunConfig,
      logger,
      preferLocalhost: false,
      authUser: adminUser
        ? {
            username: adminUser.username,
            password: adminUser.password,
          }
        : undefined,
    });
  }

  if (shouldSetupReplicaSet && mongoRunConfig.authorization !== 'disabled') {
    const adminUser = findAdminUser({
      users: mongoRunConfig.users,
      isRequired: true,
    });
    const cluserAdminUser = findClusterAdminUser({
      users: mongoRunConfig.users,
      isRequired: true,
    });
    await setupUser({
      mongoRunConfig,
      logger,
      authUser: {
        username: adminUser.username,
        password: adminUser.password,
      },
      connectionType: 'replicaSet',
      user: cluserAdminUser,
    });
  }

  // Setup users if requested
  if (shouldSetupUsers) {
    const adminUser = findAdminUser({
      users: mongoRunConfig.users,
      isRequired: true,
    });
    await setupMongoUsers({
      mongoRunConfig,
      logger,
      authUser: {
        username: adminUser.username,
        password: adminUser.password,
      },
      connectionType: 'replicaSet',
    });
  }

  if (printUri && shouldSetupReplicaSet) {
    await printMongoUriMain({
      mongoRunConfig,
      logger,
      connectionType: 'replicaSet',
    });
  }
}
