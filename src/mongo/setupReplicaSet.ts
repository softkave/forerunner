import assert from 'assert';
import {execFile} from 'child_process';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {getDockerContainerName, startMongoMain} from './startMongo.js';
import {compileHostnames, getFirstNonLocalhostBindIp} from './utils.js';
import {promisify} from 'util';

const kMongoshFirstInstance = 1;
const execFileAsync = promisify(execFile);

function buildMembers(
  mongoRunConfig: MongoRunConfig
): {_id: number; host: string}[] {
  return mongoRunConfig.ports.map((port, index) => {
    const hostnames = compileHostnames({
      hostnames: mongoRunConfig.hostnames[index],
    });
    const hostname = getFirstNonLocalhostBindIp({hostnames}) ?? hostnames[0];
    assert.ok(hostname, `hostname must be set for instance ${index + 1}`);
    return {_id: index, host: `${hostname}:${port}`};
  });
}

function getMongoshConnectionUri(params: {
  mongoRunConfig: MongoRunConfig;
  authUser?: {username: string; password: string};
}): string {
  const {mongoRunConfig, authUser} = params;
  const hostnames = compileHostnames({
    hostnames: mongoRunConfig.hostnames[0],
  });
  const hostname = getFirstNonLocalhostBindIp({hostnames}) ?? hostnames[0];
  assert.ok(hostname, `hostname must be set for instance 1`);
  const port = mongoRunConfig.ports[0];
  const auth =
    authUser?.username && authUser?.password
      ? `${encodeURIComponent(authUser.username)}:${encodeURIComponent(
          authUser.password
        )}@`
      : '';
  return `mongodb://${auth}${hostname}:${port}`;
}

async function runMongoshInContainer(params: {
  containerName: string;
  uri: string;
  script: string;
  logger: IForeLogger;
}): Promise<{stdout: string; stderr: string}> {
  const {containerName, uri, script, logger} = params;
  const args = [
    'exec',
    containerName,
    'mongosh',
    '--tls',
    '--tlsCAFile',
    '/certs/ca.crt.pem',
    '--tlsAllowInvalidCertificates',
    uri,
    '--eval',
    script,
    '--quiet',
  ];
  logger.log('Running mongosh in container:', containerName);
  const {stdout} = await execFileAsync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {stdout: String(stdout), stderr: ''};
}

async function runMongoshInContainerOrThrow(params: {
  containerName: string;
  uri: string;
  script: string;
  logger: IForeLogger;
}): Promise<string> {
  try {
    const {stdout} = await runMongoshInContainer(params);
    return stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `mongosh failed in container ${params.containerName}: ${msg}`
    );
  }
}

export async function setupReplicaSet(params: {
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
  authUser?: {username: string; password: string};
}) {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    authUser,
  } = params;

  logger.log('Setting up replica set...');

  const replicaSetName = mongoRunConfig.replicaSetName;

  const containerName = getDockerContainerName(
    mongoRunConfig,
    kMongoshFirstInstance
  );
  const uri = getMongoshConnectionUri({mongoRunConfig, authUser});

  // Check if replica set is already initialized using mongosh
  let alreadyInitialized = false;
  try {
    await runMongoshInContainer({
      containerName,
      uri,
      script: 'rs.status()',
      logger,
    });
    alreadyInitialized = true;
    logger.log('Replica set already initialized');
  } catch {
    // rs.status() failed => not initialized or other error; we will try to
    // initiate
  }

  if (!alreadyInitialized) {
    logger.log('Initializing replica set...');
    const members = buildMembers(mongoRunConfig);
    const config = {_id: replicaSetName, members};
    const script = `rs.initiate(${JSON.stringify(config)})`;
    await runMongoshInContainerOrThrow({
      containerName,
      uri,
      script,
      logger,
    });
    logger.log('Replica set initialization completed');
  }
}

/**
 * @deprecated Use startMongodInstancesMain instead
 */
export async function setupReplicaSetMain(params: {
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
  shouldSetupUsers?: boolean;
  authUser?: {username: string; password: string};
}) {
  // This function is kept for backwards compatibility.
  // It now delegates to startMongodInstancesMain which handles everything.
  await startMongoMain({
    mongoRunConfig: params.mongoRunConfig,
    logger: params.logger,
    waitUntilListening: true,
    shouldInitDbRootUser: true,
    shouldSetupReplicaSet: true,
    shouldSetupUsers: params.shouldSetupUsers ?? true,
  });
}
