import assert from 'assert';
import {execFile} from 'child_process';
import {waitTimeout} from 'softkave-js-utils';
import {promisify} from 'util';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {
  buildReplicaSetInitiateScript,
  buildReplicaSetReconfigScript,
  getMongoshErrorMessage,
  isMongoAlreadyInitializedError,
  isMongoAuthProbeUnavailableError,
  isMongoNotYetInitializedError,
  kReplSetConfigProbeScript,
  kReplSetHasPrimaryScript,
  kReplSetMembersReadScript,
  parseReplicaSetMembersOutput,
  ReplicaSetMemberConfig,
  replicaSetMembersMatch,
} from './replSetInitHelpers.js';
import {getDockerContainerName, startMongoMain} from './startMongo.js';
import {
  compileHostnames,
  getFirstLocalhostBindIp,
  getFirstNonLocalhostBindIp,
} from './utils.js';

const kMongoshFirstInstance = 1;
const kReplSetInitProbeMaxAttempts = 5;
const kReplSetInitProbeRetryIntervalMs = 500;
const kReplSetPrimaryWaitMaxMs = 30_000;
const kReplSetPrimaryPollIntervalMs = 500;
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
  preferLocalhost?: boolean;
}): string {
  const {mongoRunConfig, authUser, preferLocalhost = false} = params;
  const hostnames = compileHostnames({
    hostnames: mongoRunConfig.hostnames[0],
  });
  const hostname = preferLocalhost
    ? (getFirstLocalhostBindIp({hostnames}) ?? hostnames[0])
    : (getFirstNonLocalhostBindIp({hostnames}) ?? hostnames[0]);
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
    const msg = getMongoshErrorMessage(err);
    throw new Error(
      `mongosh failed in container ${params.containerName}: ${msg}`
    );
  }
}

type ReplSetInitProbeResult =
  | {status: 'initialized'}
  | {status: 'not_initialized'}
  /** Credentials cannot read repl state; try the next probe URI. */
  | {status: 'auth_unavailable'};

function parseReplSetConfigProbeOutput(stdout: string): boolean {
  const trimmed = stdout.trim().toLowerCase();
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  throw new Error(`unexpected replset config probe output: ${stdout}`);
}

async function probeReplicaSetConfig(params: {
  containerName: string;
  uri: string;
  logger: IForeLogger;
}): Promise<ReplSetInitProbeResult> {
  const {containerName, uri, logger} = params;
  try {
    const {stdout} = await runMongoshInContainer({
      containerName,
      uri,
      script: kReplSetConfigProbeScript,
      logger,
    });
    return parseReplSetConfigProbeOutput(stdout)
      ? {status: 'initialized'}
      : {status: 'not_initialized'};
  } catch (err) {
    const msg = getMongoshErrorMessage(err);
    if (isMongoAuthProbeUnavailableError(msg)) {
      return {status: 'auth_unavailable'};
    }
    if (isMongoAlreadyInitializedError(msg)) {
      return {status: 'initialized'};
    }
    if (isMongoNotYetInitializedError(msg)) {
      return {status: 'not_initialized'};
    }
    throw new Error(`mongosh failed in container ${containerName}: ${msg}`);
  }
}

async function probeReplicaSetConfigWithRetry(params: {
  containerName: string;
  uri: string;
  logger: IForeLogger;
}): Promise<ReplSetInitProbeResult> {
  for (let attempt = 0; attempt < kReplSetInitProbeMaxAttempts; attempt++) {
    const result = await probeReplicaSetConfig(params);
    if (result.status !== 'not_initialized') {
      return result;
    }
    if (attempt < kReplSetInitProbeMaxAttempts - 1) {
      await waitTimeout(kReplSetInitProbeRetryIntervalMs);
    }
  }
  return {status: 'not_initialized'};
}

type ReplSetProbeCredential = {
  label: string;
  uri: string;
};

function buildReplicaSetProbeCredentials(params: {
  mongoRunConfig: MongoRunConfig;
  adminUser?: {username: string; password: string};
  clusterAdminUser?: {username: string; password: string};
}): ReplSetProbeCredential[] {
  const {mongoRunConfig, adminUser, clusterAdminUser} = params;
  const credentials: ReplSetProbeCredential[] = [];

  // Prefer cluster-admin when auth is fully configured: only clusterAdmin can
  // reliably read repl state after users are set up.
  if (clusterAdminUser) {
    credentials.push({
      label: 'cluster-admin',
      uri: getMongoshConnectionUri({
        mongoRunConfig,
        authUser: clusterAdminUser,
      }),
    });
  }
  if (adminUser) {
    credentials.push({
      label: 'admin',
      uri: getMongoshConnectionUri({
        mongoRunConfig,
        authUser: adminUser,
      }),
    });
  }
  if (credentials.length === 0) {
    credentials.push({
      label: 'no-auth',
      uri: getMongoshConnectionUri({mongoRunConfig}),
    });
  }
  return credentials;
}

async function probeReplicaSetWithCredentialFallback(params: {
  containerName: string;
  credentials: ReplSetProbeCredential[];
  logger: IForeLogger;
}): Promise<{status: 'initialized' | 'not_initialized'; uri: string}> {
  const {containerName, credentials, logger} = params;
  let sawAuthUnavailable = false;

  for (const {label, uri} of credentials) {
    const result = await probeReplicaSetConfigWithRetry({
      containerName,
      uri,
      logger,
    });
    if (
      result.status === 'initialized' ||
      result.status === 'not_initialized'
    ) {
      logger.log(`Replica set probe succeeded with ${label} credential`);
      return {status: result.status, uri};
    }
    sawAuthUnavailable = true;
    logger.log(
      `Replica set probe unavailable with ${label} credential, trying next`
    );
  }

  if (sawAuthUnavailable) {
    throw new Error('Not authorized to check replica set status');
  }
  throw new Error('No credentials available for replica set probe');
}

async function getPersistedReplicaSetMembers(params: {
  containerName: string;
  uri: string;
  logger: IForeLogger;
}): Promise<ReplicaSetMemberConfig[]> {
  const stdout = await runMongoshInContainerOrThrow({
    ...params,
    script: kReplSetMembersReadScript,
  });
  return parseReplicaSetMembersOutput(stdout);
}

async function reconfigReplicaSetIfMembersChanged(params: {
  mongoRunConfig: MongoRunConfig;
  uri: string;
  replicaSetName: string;
  expectedMembers: ReplicaSetMemberConfig[];
  logger: IForeLogger;
}): Promise<boolean> {
  const {mongoRunConfig, uri, replicaSetName, expectedMembers, logger} = params;
  const containerName = getDockerContainerName(
    mongoRunConfig,
    kMongoshFirstInstance
  );
  const currentMembers = await getPersistedReplicaSetMembers({
    containerName,
    uri,
    logger,
  });
  if (currentMembers.length === 0) {
    logger.log(
      'No persisted replica set config found; skipping reconfiguration'
    );
    return false;
  }
  if (replicaSetMembersMatch(expectedMembers, currentMembers)) {
    return false;
  }
  logger.log(
    'Persisted replica set member list does not match current config; reconfiguring...'
  );
  const config = {_id: replicaSetName, members: expectedMembers};
  await runMongoshInContainerOrThrow({
    containerName,
    uri,
    script: buildReplicaSetReconfigScript(config),
    logger,
  });
  logger.log('Replica set reconfiguration completed');
  return true;
}

async function waitForReplicaSetPrimary(params: {
  mongoRunConfig: MongoRunConfig;
  uri: string;
  logger: IForeLogger;
}): Promise<void> {
  const {mongoRunConfig, uri, logger} = params;
  const containerName = getDockerContainerName(
    mongoRunConfig,
    kMongoshFirstInstance
  );
  const deadline = Date.now() + kReplSetPrimaryWaitMaxMs;

  while (Date.now() < deadline) {
    try {
      const stdout = await runMongoshInContainerOrThrow({
        containerName,
        uri,
        script: kReplSetHasPrimaryScript,
        logger,
      });
      if (stdout.trim() === 'true') {
        logger.log('Replica set has a PRIMARY');
        return;
      }
    } catch (err) {
      const msg = getMongoshErrorMessage(err);
      logger.log(`Waiting for replica set PRIMARY: ${msg}`);
    }
    await waitTimeout(kReplSetPrimaryPollIntervalMs);
  }

  throw new Error('Timeout waiting for replica set PRIMARY');
}

export async function setupReplicaSet(params: {
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
  adminUser?: {username: string; password: string};
  clusterAdminUser?: {username: string; password: string};
}) {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    adminUser,
    clusterAdminUser,
  } = params;

  logger.log('Setting up replica set...');

  const replicaSetName = mongoRunConfig.replicaSetName;

  const containerName = getDockerContainerName(
    mongoRunConfig,
    kMongoshFirstInstance
  );
  const adminUri = getMongoshConnectionUri({
    mongoRunConfig,
    authUser: adminUser,
  });
  const members = buildMembers(mongoRunConfig);
  const probeCredentials = buildReplicaSetProbeCredentials({
    mongoRunConfig,
    adminUser,
    clusterAdminUser,
  });
  const probe = await probeReplicaSetWithCredentialFallback({
    containerName,
    credentials: probeCredentials,
    logger,
  });
  const mongoshUri = probe.uri;

  if (probe.status === 'initialized') {
    const persistedMembers = await getPersistedReplicaSetMembers({
      containerName,
      uri: mongoshUri,
      logger,
    });
    if (persistedMembers.length > 0) {
      await reconfigReplicaSetIfMembersChanged({
        mongoRunConfig,
        uri: mongoshUri,
        replicaSetName,
        expectedMembers: members,
        logger,
      });
      await waitForReplicaSetPrimary({
        mongoRunConfig,
        uri: mongoshUri,
        logger,
      });
      logger.log('Replica set is already initialized');
      return {alreadyInitialized: true};
    }
    logger.log(
      'Replica set probe reported initialized but no persisted config was found; initiating...'
    );
  }

  logger.log('Initializing replica set...');
  const config = {_id: replicaSetName, members};
  const script = buildReplicaSetInitiateScript(config);

  try {
    await runMongoshInContainerOrThrow({
      containerName,
      uri: adminUri,
      script,
      logger,
    });
  } catch (err) {
    const msg = getMongoshErrorMessage(err);
    if (isMongoAlreadyInitializedError(msg)) {
      const persistedMembers = await getPersistedReplicaSetMembers({
        containerName,
        uri: mongoshUri,
        logger,
      });
      if (persistedMembers.length > 0) {
        await reconfigReplicaSetIfMembersChanged({
          mongoRunConfig,
          uri: mongoshUri,
          replicaSetName,
          expectedMembers: members,
          logger,
        });
      }
      await waitForReplicaSetPrimary({
        mongoRunConfig,
        uri: mongoshUri,
        logger,
      });
      logger.log('Replica set is already initialized');
      return {alreadyInitialized: true};
    }
    throw err;
  }

  await waitForReplicaSetPrimary({
    mongoRunConfig,
    uri: mongoshUri,
    logger,
  });
  logger.log('Replica set initialization completed');
  return {alreadyInitialized: false};
}

/**
 * @deprecated Use startMongodInstancesMain instead
 */
export async function setupReplicaSetMain(params: {
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
  shouldSetupUsers?: boolean;
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
