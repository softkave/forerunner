import {Client} from 'pg';
import {ConsoleForeLogger} from '../../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../../utils/foreLogger/types.js';
import {PostgresRunConfig} from '../postgresRunConfig.js';
import {stopPostgresInstance} from '../stopPostgresInstance.js';
import {isContainerRunning} from '../utils.js';

const logger = new ConsoleForeLogger({silent: true});

/**
 * Stop and remove the PostgreSQL container and its volume (when tests are
 * done). Pass removeVolume: false only if you need to keep the volume for
 * inspection.
 */
export async function cleanupPostgresTest(params: {
  postgresRunConfig: PostgresRunConfig;
  removeVolume?: boolean;
}) {
  const {postgresRunConfig, removeVolume = true} = params;
  await stopPostgresInstance({
    containerName: postgresRunConfig.containerName,
    postgresRunConfig,
    logger,
    removeVolume,
  });
}

/**
 * Check that a user can connect to PostgreSQL with the given credentials and
 * database
 */
export async function checkUserCanConnect(params: {
  postgresRunConfig: PostgresRunConfig;
  username: string;
  password: string;
  database: string;
  logger?: IForeLogger;
}): Promise<boolean> {
  const {postgresRunConfig, username, password, database} = params;
  const client = new Client({
    host: '127.0.0.1',
    port: postgresRunConfig.port,
    user: username,
    password,
    database,
    connectionTimeoutMillis: 3000,
    ssl:
      postgresRunConfig.ssl === 'enabled'
        ? {rejectUnauthorized: false}
        : undefined,
  });
  try {
    await client.connect();
    const result = await client.query('SELECT 1 as ok');
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  } finally {
    await client.end();
  }
}

/**
 * Check that a user cannot connect (e.g. wrong password or no access to
 * database)
 */
export async function checkUserCannotConnect(params: {
  postgresRunConfig: PostgresRunConfig;
  username: string;
  password: string;
  database: string;
  logger?: IForeLogger;
}): Promise<boolean> {
  const connected = await checkUserCanConnect(params);
  return !connected;
}

/**
 * Wait until container is not running (for after stop)
 */
export async function waitUntilContainerStopped(
  containerName: string,
  timeoutMs = 15000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isContainerRunning(containerName)) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(
    `Container ${containerName} did not stop within ${timeoutMs}ms`
  );
}
