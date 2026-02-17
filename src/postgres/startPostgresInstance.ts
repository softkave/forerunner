import {execFileSync} from 'child_process';
import {Client} from 'pg';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {getAuthUserFromConfig, PostgresRunConfig} from './postgresRunConfig.js';
import {
  containerExists,
  ensureDockerAvailable,
  generateRandomPassword,
  getPostgresClient,
  isContainerRunning,
  readPgHbaConf,
  readPostgresConfig,
  reloadPostgresConfigViaClient,
  setPgHbaToScram,
  setPostgresConfPasswordEncryption,
  volumeExists,
  writePgHbaConf,
  writePostgresConfig,
} from './utils.js';

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

  // Handle volume management
  const volumeExistsCheck = volumeExists(volumeName);
  if (!postgresRunConfig.keep && volumeExistsCheck) {
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

  // Check if container is already running
  if (isContainerRunning(containerName)) {
    logger.log(`Container ${containerName} is already running; skipping start`);
    return;
  }

  // Remove existing container if it exists but is not running
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

  // Prepare environment variables
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

  // Build docker run command
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
    image,
  ];

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

  if (waitUntilListening) {
    logger.log(`Waiting for PostgreSQL to begin listening...`);
    const authUser = getAuthUserFromConfig(postgresRunConfig);
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      if (isContainerRunning(containerName)) {
        try {
          const client = new Client({
            host: '127.0.0.1',
            port: port,
            user: authUser?.username ?? firstUser?.username ?? 'postgres',
            password: authUser?.password ?? firstUser?.password ?? undefined,
            database: postgresRunConfig.dbs?.[0] ?? 'postgres',
            connectionTimeoutMillis: 2000,
          });
          await client.connect();
          await client.end();
          logger.log('PostgreSQL is ready');
          break;
        } catch {
          // Not ready yet, continue waiting
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    if (attempts >= maxAttempts) {
      throw new Error(
        `PostgreSQL container ${containerName} did not become ready within ${maxAttempts} seconds`
      );
    }

    // When authorization enabled: set postgres superuser password if not in
    // users, ensure pg_hba/scram
    if (authEnabled && firstUser) {
      const client = await getPostgresClient({
        postgresRunConfig,
        database: 'postgres',
      });
      const postgresSuperuser = postgresRunConfig.users?.find(
        u => u.username === 'postgres'
      );
      try {
        if (!postgresSuperuser?.password) {
          const randomPw = generateRandomPassword();
          await client.query(`ALTER USER postgres WITH PASSWORD $1`, [
            randomPw,
          ]);
          logger.log(
            'Set postgres superuser to random password (not in user list)'
          );
        }
        const pgHbaContent = readPgHbaConf(containerName);
        const postgresConfContent = readPostgresConfig(containerName);
        const hbaScram = setPgHbaToScram(pgHbaContent);
        const confScram =
          setPostgresConfPasswordEncryption(postgresConfContent);
        if (hbaScram !== pgHbaContent) {
          writePgHbaConf(containerName, hbaScram);
          logger.log('Updated pg_hba.conf (local and host to scram-sha-256)');
        }
        if (confScram !== postgresConfContent) {
          writePostgresConfig(containerName, confScram);
          logger.log(
            'Updated postgresql.conf (password_encryption=scram-sha-256)'
          );
        }
        if (hbaScram !== pgHbaContent || confScram !== postgresConfContent) {
          await reloadPostgresConfigViaClient(client);
          logger.log('Reloaded PostgreSQL configuration');
        }
      } finally {
        await client.end();
      }
    }
  }
}
