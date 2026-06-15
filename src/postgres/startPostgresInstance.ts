import {execFile} from 'child_process';
import path from 'path';
import {Client} from 'pg';
import {promisify} from 'util';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {spawnInherit} from '../utils/spawnInherit.js';
import {
  ensurePostgresSslCertPermissions,
  resolvePostgresCertOutDir,
} from './generatePostgresCertConfigs.js';
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
  getPostgresVolumeMountPath,
  reloadPostgresConfigViaClient,
  setPgHbaRequireSSL,
  setPostgresConfPasswordEncryption,
  setPostgresConfSSL,
  volumeExists,
  waitForPostgresReady,
  writePgHbaConf,
  writePostgresConfig,
} from './utils.js';

const execFileAsync = promisify(execFile);

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
async function ensureVolume(params: {
  volumeName: string;
  keep: boolean;
  logger: IForeLogger;
}): Promise<void> {
  const {volumeName, keep, logger} = params;
  const volumeExistsCheck = await volumeExists(volumeName);

  if (!keep && volumeExistsCheck) {
    logger.log(`Removing existing volume ${volumeName} (keep=false)...`);
    try {
      await execFileAsync('docker', ['volume', 'rm', volumeName], {
        encoding: 'utf8',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.log(`Warning: Could not remove volume ${volumeName}: ${msg}`);
    }
  }

  if (!(await volumeExists(volumeName))) {
    logger.log(`Creating volume ${volumeName}...`);
    await execFileAsync('docker', ['volume', 'create', volumeName], {
      encoding: 'utf8',
    });
  }
}

/**
 * Ensures container is not running, removing it if it exists but is stopped
 */
async function ensureContainerNotRunning(params: {
  containerName: string;
  logger: IForeLogger;
}): Promise<void> {
  const {containerName, logger} = params;

  if (await containerExists(containerName)) {
    logger.log(`Removing existing stopped container ${containerName}...`);
    try {
      await execFileAsync('docker', ['rm', containerName], {encoding: 'utf8'});
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
async function buildDockerRunArgs(params: {
  postgresRunConfig: PostgresRunConfig;
  envVars: string[];
  logger: IForeLogger;
}): Promise<string[]> {
  const {postgresRunConfig, envVars, logger} = params;
  const containerName = postgresRunConfig.containerName;
  const volumeName = postgresRunConfig.volumeName;
  const port = postgresRunConfig.port;
  const image = `postgres:${postgresRunConfig.postgresVersion}`;
  const sslEnabled = postgresRunConfig.ssl === 'enabled';

  const discoverability = postgresRunConfig.discoverability ?? 'local';
  const portMapping =
    discoverability === 'local' ? `127.0.0.1:${port}:5432` : `${port}:5432`;

  const volumeMountPath = getPostgresVolumeMountPath(
    postgresRunConfig.postgresVersion
  );
  const runArgs: string[] = [
    'run',
    '-d',
    '--name',
    containerName,
    '-p',
    portMapping,
    '-v',
    `${volumeName}:${volumeMountPath}`,
    ...envVars,
  ];

  if (postgresRunConfig.labels) {
    for (const [k, v] of Object.entries(postgresRunConfig.labels)) {
      runArgs.push('--label', `${k}=${v}`);
    }
  }

  // Mount SSL certificates if SSL is enabled
  if (sslEnabled) {
    const certsDirResolved = await resolvePostgresCertOutDir(postgresRunConfig);
    runArgs.push('-v', `${certsDirResolved}:/var/lib/postgresql/certs:ro`);
    logger.log(`Mounting SSL certificates from: ${certsDirResolved}`);
  }

  runArgs.push(image);

  return runArgs;
}

/**
 * Starts the Docker container
 */
async function startDockerContainer(params: {
  containerName: string;
  port: number;
  volumeName: string;
  image: string;
  runArgs: string[];
  logger: IForeLogger;
}): Promise<void> {
  const {containerName, port, volumeName, image, runArgs, logger} = params;

  logger.log(`Starting PostgreSQL container ${containerName}...`);
  logger.log(`Port: ${port}`);
  logger.log(`Volume: ${volumeName}`);
  logger.log(`Image: ${image}`);

  try {
    await spawnInherit('docker', runArgs);
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

  // Set postgres superuser password if not in users list (only if role exists;
  // when POSTGRES_USER is set, the image may not create the postgres role)
  if (!postgresSuperuser?.password) {
    const roleCheck = await client.query(
      "SELECT 1 FROM pg_roles WHERE rolname = 'postgres'"
    );
    if (roleCheck.rows.length > 0) {
      const randomPw = generateRandomPassword();
      await client.query(
        `ALTER USER postgres WITH PASSWORD $pg$${randomPw}$pg$`
      );
      logger.log(
        'Set postgres superuser to random password (not in user list)'
      );
    }
  }

  // Update postgresql.conf for scram-sha-256
  const postgresConfContent = await readPostgresConfig({
    containerName,
    postgresVersion: postgresRunConfig.postgresVersion,
  });
  const confScram = setPostgresConfPasswordEncryption(postgresConfContent);

  let configChanged = false;

  if (confScram !== postgresConfContent) {
    await writePostgresConfig({
      containerName,
      postgresVersion: postgresRunConfig.postgresVersion,
      content: confScram,
    });
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
        discoverability: postgresRunConfig.discoverability,
      });
      pgHbaEntries.push(entries);
    }
  }

  const newPgHba = pgHbaEntries.join('\n') + '\n';
  const pgHbaContent = await readPgHbaConf({
    containerName,
    postgresVersion: postgresRunConfig.postgresVersion,
  });

  if (newPgHba.trim() !== pgHbaContent.trim()) {
    await writePgHbaConf({
      containerName,
      postgresVersion: postgresRunConfig.postgresVersion,
      content: newPgHba,
    });
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
async function restartPostgresContainer(params: {
  containerName: string;
  logger: IForeLogger;
}): Promise<void> {
  const {containerName, logger} = params;
  logger.log(`Restarting container ${containerName} to apply SSL settings...`);
  await execFileAsync('docker', ['restart', containerName], {encoding: 'utf8'});
}

async function configurePostgresSSL(params: {
  postgresRunConfig: PostgresRunConfig;
  containerName: string;
  client: Client;
  logger: IForeLogger;
}): Promise<boolean> {
  const {postgresRunConfig, containerName, client, logger} = params;

  if (postgresRunConfig.ssl !== 'enabled') {
    return false;
  }

  const pgHbaContent = await readPgHbaConf({
    containerName,
    postgresVersion: postgresRunConfig.postgresVersion,
  });
  const postgresConfContent = await readPostgresConfig({
    containerName,
    postgresVersion: postgresRunConfig.postgresVersion,
  });

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
  let sslConfChanged = false;

  if (confWithSSL !== postgresConfContent) {
    await writePostgresConfig({
      containerName,
      postgresVersion: postgresRunConfig.postgresVersion,
      content: confWithSSL,
    });
    logger.log('Updated postgresql.conf (SSL enabled)');
    configChanged = true;
    sslConfChanged = true;
  }

  if (hbaWithSSL !== pgHbaContent) {
    await writePgHbaConf({
      containerName,
      postgresVersion: postgresRunConfig.postgresVersion,
      content: hbaWithSSL,
    });
    logger.log('Updated pg_hba.conf (SSL required for host connections)');
    configChanged = true;
  }

  if (configChanged && !sslConfChanged) {
    await reloadPostgresConfigViaClient(client);
    logger.log('Reloaded PostgreSQL configuration (SSL)');
  }

  return sslConfChanged;
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

  await ensureDockerAvailable();

  const containerName = postgresRunConfig.containerName;
  const volumeName = postgresRunConfig.volumeName;
  const port = postgresRunConfig.port;
  const image = `postgres:${postgresRunConfig.postgresVersion}`;

  // Generate SSL certificates if needed
  await ensureSSLCertificates({postgresRunConfig, logger});

  if (postgresRunConfig.ssl === 'enabled') {
    await ensurePostgresSslCertPermissions(postgresRunConfig, {logger});
  }

  // Ensure volume exists
  await ensureVolume({
    volumeName,
    keep: postgresRunConfig.keep ?? false,
    logger,
  });

  if (await isContainerRunning(containerName)) {
    logger.log(
      `Container ${containerName} is already running; skipping new container start`
    );
    if (waitUntilListening) {
      const {connectedWithSsl} = await waitForPostgresReady({
        postgresRunConfig,
        containerName,
        port,
        logger,
        maxAttempts: 10,
        retryIntervalMs: 1000,
      });
      const client = await getPostgresClient({
        postgresRunConfig,
        database: 'postgres',
        ssl: connectedWithSsl,
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
    return;
  }

  await ensureContainerNotRunning({containerName, logger});

  // Build Docker command arguments
  const envVars = buildDockerEnvVars({postgresRunConfig});
  const runArgs = await buildDockerRunArgs({
    postgresRunConfig,
    envVars,
    logger,
  });

  // Start the container
  await startDockerContainer({
    containerName,
    port,
    volumeName,
    image,
    runArgs,
    logger,
  });

  // Wait and configure if requested
  if (waitUntilListening) {
    const {connectedWithSsl} = await waitForPostgresReady({
      postgresRunConfig,
      containerName,
      port,
      logger,
      maxAttempts: 10,
      retryIntervalMs: 1000,
    });

    const client = await getPostgresClient({
      postgresRunConfig,
      database: 'postgres',
      ssl: connectedWithSsl,
    });

    let clientClosed = false;
    try {
      await configurePostgresAuthorization({
        postgresRunConfig,
        containerName,
        client,
        logger,
      });

      const sslConfChanged = await configurePostgresSSL({
        postgresRunConfig,
        containerName,
        client,
        logger,
      });
      await client.end();
      clientClosed = true;

      if (sslConfChanged) {
        await ensurePostgresSslCertPermissions(postgresRunConfig, {logger});
        await restartPostgresContainer({containerName, logger});
        await waitForPostgresReady({
          postgresRunConfig,
          containerName,
          port,
          sslEnabled: true,
          logger,
          maxAttempts: 10,
          retryIntervalMs: 1000,
        });
      }
    } finally {
      if (!clientClosed) {
        await client.end();
      }
    }
  }
}
