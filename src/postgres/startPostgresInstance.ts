import {execFileSync} from 'child_process';
import path from 'path';
import {Client} from 'pg';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {getPostgresCertOutDir} from './generatePostgresCertConfigs.js';
import {generatePostgresCertsMain} from './generatePostgresCerts.js';
import {PostgresRunConfig} from './postgresRunConfig.js';
import {
  containerExists,
  ensureDockerAvailable,
  generatePgHbaEntriesForUser,
  generateRandomPassword,
  getPostgresClient,
  isContainerRunning,
  pgHbaRequiresSSL,
  readPgHbaConf,
  readPostgresConfig,
  reloadPostgresConfigViaClient,
  setPgHbaRequireSSL,
  setPostgresConfPasswordEncryption,
  setPostgresConfSSL,
  volumeExists,
  waitForPostgresReady,
  writePgHbaConf,
  writePostgresConfig,
} from './utils.js';

/**
 * Ensures SSL certificates are generated if SSL is enabled
 */
async function ensureSSLCertificates(params: {
  postgresRunConfig: PostgresRunConfig;
  logger: IForeLogger;
}): Promise<void> {
  const {postgresRunConfig, logger} = params;
  if (postgresRunConfig.ssl === 'enabled') {
    logger.log('Generating SSL certificates...');
    await generatePostgresCertsMain({
      postgresRunConfig,
      overwriteConfig: false,
      overwriteCA: false,
      overwriteCerts: false,
      logger,
    });
  }
}

/**
 * Ensures the Docker volume exists, removing it first if keep=false
 */
function ensureVolume(params: {
  volumeName: string;
  keep: boolean;
  logger: IForeLogger;
}): void {
  const {volumeName, keep, logger} = params;
  const volumeExistsCheck = volumeExists(volumeName);

  if (!keep && volumeExistsCheck) {
    logger.log(`Removing existing volume ${volumeName} (keep=false)...`);
    try {
      execFileSync('docker', ['volume', 'rm', volumeName], {
        stdio: 'pipe',
        encoding: 'utf8',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.log(`Warning: Could not remove volume ${volumeName}: ${msg}`);
    }
  }

  if (!volumeExists(volumeName)) {
    logger.log(`Creating volume ${volumeName}...`);
    execFileSync('docker', ['volume', 'create', volumeName], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
  }
}

/**
 * Ensures container is not running, removing it if it exists but is stopped
 */
function ensureContainerNotRunning(params: {
  containerName: string;
  logger: IForeLogger;
}): void {
  const {containerName, logger} = params;

  if (isContainerRunning(containerName)) {
    logger.log(`Container ${containerName} is already running; skipping start`);
    return;
  }

  if (containerExists(containerName)) {
    logger.log(`Removing existing stopped container ${containerName}...`);
    try {
      execFileSync('docker', ['rm', containerName], {
        stdio: 'pipe',
        encoding: 'utf8',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to remove existing container ${containerName}: ${msg}`
      );
    }
  }
}

/**
 * Builds Docker environment variables for PostgreSQL container
 */
function buildDockerEnvVars(params: {
  postgresRunConfig: PostgresRunConfig;
}): string[] {
  const {postgresRunConfig} = params;
  const firstUser = postgresRunConfig.users?.[0];
  const envVars: string[] = [];
  const authEnabled = postgresRunConfig.authorization === 'enabled';

  if (authEnabled && firstUser) {
    envVars.push('-e', `POSTGRES_USER=${firstUser.username}`);
    envVars.push('-e', `POSTGRES_PASSWORD=${firstUser.password}`);
  } else if (!authEnabled && firstUser) {
    envVars.push('-e', `POSTGRES_USER=${firstUser.username}`);
    if (firstUser.password) {
      envVars.push('-e', `POSTGRES_PASSWORD=${firstUser.password}`);
    }
    envVars.push('-e', 'POSTGRES_HOST_AUTH_METHOD=trust');
  } else if (!authEnabled) {
    envVars.push('-e', 'POSTGRES_HOST_AUTH_METHOD=trust');
  }

  if (postgresRunConfig.dbs?.[0]) {
    envVars.push('-e', `POSTGRES_DB=${postgresRunConfig.dbs[0]}`);
  }

  return envVars;
}

/**
 * Builds Docker run command arguments
 */
function buildDockerRunArgs(params: {
  postgresRunConfig: PostgresRunConfig;
  envVars: string[];
  logger: IForeLogger;
}): string[] {
  const {postgresRunConfig, envVars, logger} = params;
  const containerName = postgresRunConfig.containerName;
  const volumeName = postgresRunConfig.volumeName;
  const port = postgresRunConfig.port;
  const image = `postgres:${postgresRunConfig.postgresVersion}`;
  const sslEnabled = postgresRunConfig.ssl === 'enabled';

  const runArgs: string[] = [
    'run',
    '-d',
    '--name',
    containerName,
    '-p',
    `127.0.0.1:${port}:5432`, // Bind only to localhost
    '-v',
    `${volumeName}:/var/lib/postgresql/data`,
    ...envVars,
  ];

  // Mount SSL certificates if SSL is enabled
  if (sslEnabled) {
    const certsDir = getPostgresCertOutDir(postgresRunConfig);
    const certsDirResolved = path.resolve(
      postgresRunConfig.workingDir,
      certsDir
    );
    runArgs.push('-v', `${certsDirResolved}:/var/lib/postgresql/certs:ro`);
    logger.log(`Mounting SSL certificates from: ${certsDirResolved}`);
  }

  runArgs.push(image);

  return runArgs;
}

/**
 * Starts the Docker container
 */
function startDockerContainer(params: {
  containerName: string;
  port: number;
  volumeName: string;
  image: string;
  runArgs: string[];
  logger: IForeLogger;
}): void {
  const {containerName, port, volumeName, image, runArgs, logger} = params;

  logger.log(`Starting PostgreSQL container ${containerName}...`);
  logger.log(`Port: ${port}`);
  logger.log(`Volume: ${volumeName}`);
  logger.log(`Image: ${image}`);

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

/**
 * Configures PostgreSQL authorization (scram-sha-256) if enabled
 */
async function configurePostgresAuthorization(params: {
  postgresRunConfig: PostgresRunConfig;
  containerName: string;
  client: Client;
  logger: IForeLogger;
}): Promise<void> {
  const {postgresRunConfig, containerName, client, logger} = params;
  const authEnabled = postgresRunConfig.authorization === 'enabled';
  const firstUser = postgresRunConfig.users?.[0];

  if (!authEnabled || !firstUser) {
    return;
  }

  const postgresSuperuser = postgresRunConfig.users?.find(
    u => u.username === 'postgres'
  );

  // Set postgres superuser password if not in users list
  if (!postgresSuperuser?.password) {
    const randomPw = generateRandomPassword();
    await client.query(`ALTER USER postgres WITH PASSWORD $1`, [randomPw]);
    logger.log('Set postgres superuser to random password (not in user list)');
  }

  // Update postgresql.conf for scram-sha-256
  const postgresConfContent = readPostgresConfig(containerName);
  const confScram = setPostgresConfPasswordEncryption(postgresConfContent);

  let configChanged = false;

  if (confScram !== postgresConfContent) {
    writePostgresConfig(containerName, confScram);
    logger.log('Updated postgresql.conf (password_encryption=scram-sha-256)');
    configChanged = true;
  }

  // Generate pg_hba.conf entries with database-specific access
  const sslEnabled = postgresRunConfig.ssl === 'enabled';
  const authMethod = 'scram-sha-256';
  const pgHbaEntries: string[] = [];

  if (postgresRunConfig.users) {
    for (const user of postgresRunConfig.users) {
      const entries = generatePgHbaEntriesForUser({
        username: user.username,
        databases: user.databases,
        authMethod,
        requireSSL: sslEnabled,
        connectionTypes: user.connectionTypes,
      });
      pgHbaEntries.push(entries);
    }
  }

  const newPgHba = pgHbaEntries.join('\n') + '\n';
  const pgHbaContent = readPgHbaConf(containerName);

  if (newPgHba.trim() !== pgHbaContent.trim()) {
    writePgHbaConf(containerName, newPgHba);
    logger.log(
      'Updated pg_hba.conf with user-specific database entries (scram-sha-256)'
    );
    configChanged = true;
  }

  if (configChanged) {
    await reloadPostgresConfigViaClient(client);
    logger.log('Reloaded PostgreSQL configuration');
  }
}

/**
 * Configures PostgreSQL SSL if enabled
 */
async function configurePostgresSSL(params: {
  postgresRunConfig: PostgresRunConfig;
  containerName: string;
  client: Client;
  logger: IForeLogger;
}): Promise<void> {
  const {postgresRunConfig, containerName, client, logger} = params;

  if (postgresRunConfig.ssl !== 'enabled') {
    return;
  }

  const pgHbaContent = readPgHbaConf(containerName);
  const postgresConfContent = readPostgresConfig(containerName);

  // Update postgresql.conf with SSL settings
  const certPath = '/var/lib/postgresql/certs/server.crt.pem';
  const keyPath = '/var/lib/postgresql/certs/server.key.pem';
  const caPath = '/var/lib/postgresql/certs/ca.crt.pem';
  const confWithSSL = setPostgresConfSSL(
    postgresConfContent,
    certPath,
    keyPath,
    caPath
  );

  // Update pg_hba.conf to require SSL for host connections
  const hbaWithSSL = pgHbaRequiresSSL(pgHbaContent)
    ? pgHbaContent
    : setPgHbaRequireSSL(pgHbaContent);

  let configChanged = false;

  if (confWithSSL !== postgresConfContent) {
    writePostgresConfig(containerName, confWithSSL);
    logger.log('Updated postgresql.conf (SSL enabled)');
    configChanged = true;
  }

  if (hbaWithSSL !== pgHbaContent) {
    writePgHbaConf(containerName, hbaWithSSL);
    logger.log('Updated pg_hba.conf (SSL required for host connections)');
    configChanged = true;
  }

  if (configChanged) {
    await reloadPostgresConfigViaClient(client);
    logger.log('Reloaded PostgreSQL configuration (SSL)');
  }
}

export async function startPostgresInstance(params: {
  postgresRunConfig: PostgresRunConfig;
  logger?: IForeLogger;
  waitUntilListening?: boolean;
}) {
  const {
    postgresRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    waitUntilListening = false,
  } = params;

  ensureDockerAvailable();

  const containerName = postgresRunConfig.containerName;
  const volumeName = postgresRunConfig.volumeName;
  const port = postgresRunConfig.port;
  const image = `postgres:${postgresRunConfig.postgresVersion}`;
  const sslEnabled = postgresRunConfig.ssl === 'enabled';

  // Generate SSL certificates if needed
  await ensureSSLCertificates({postgresRunConfig, logger});

  // Ensure volume exists
  ensureVolume({
    volumeName,
    keep: postgresRunConfig.keep ?? false,
    logger,
  });

  // Ensure container is not running
  ensureContainerNotRunning({containerName, logger});

  // Build Docker command arguments
  const envVars = buildDockerEnvVars({postgresRunConfig});
  const runArgs = buildDockerRunArgs({postgresRunConfig, envVars, logger});

  // Start the container
  startDockerContainer({
    containerName,
    port,
    volumeName,
    image,
    runArgs,
    logger,
  });

  // Wait and configure if requested
  if (waitUntilListening) {
    await waitForPostgresReady({
      postgresRunConfig,
      containerName,
      port,
      sslEnabled,
      logger,
      maxAttempts: 10,
      retryIntervalMs: 1000,
    });

    // Configure authorization and SSL
    const client = await getPostgresClient({
      postgresRunConfig,
      database: 'postgres',
    });

    try {
      await configurePostgresAuthorization({
        postgresRunConfig,
        containerName,
        client,
        logger,
      });

      await configurePostgresSSL({
        postgresRunConfig,
        containerName,
        client,
        logger,
      });
    } finally {
      await client.end();
    }
  }
}
