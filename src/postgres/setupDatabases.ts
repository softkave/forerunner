import {Client} from 'pg';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {PostgresRunConfig} from './postgresRunConfig.js';
import {grantDatabasePermissions} from './setupUsers.js';
import {getPostgresClient} from './utils.js';

async function checkIfDatabaseExists(
  client: Client,
  dbName: string
): Promise<boolean> {
  const result = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName]
  );
  return result.rows.length > 0;
}

async function createDatabase(client: Client, dbName: string): Promise<void> {
  await client.query(`CREATE DATABASE ${client.escapeIdentifier(dbName)}`);
}

export async function setupDatabases(params: {
  postgresRunConfig: PostgresRunConfig;
  logger?: IForeLogger;
}) {
  const {postgresRunConfig, logger = new ConsoleForeLogger({silent: true})} =
    params;

  if (!postgresRunConfig.dbs || postgresRunConfig.dbs.length === 0) {
    logger.log('No databases in config; skipping database setup');
    return;
  }

  // Skip the first database (POSTGRES_DB) - it's already created via POSTGRES_DB env var
  const dbsToSetup = postgresRunConfig.dbs.slice(1);

  if (dbsToSetup.length === 0) {
    logger.log(
      'No additional databases to setup (only default database in config)'
    );
    return;
  }

  const client = await getPostgresClient({
    postgresRunConfig,
    database: 'postgres', // Connect to postgres database to create other databases
  });

  try {
    for (const dbName of dbsToSetup) {
      const exists = await checkIfDatabaseExists(client, dbName);

      if (exists) {
        logger.log(`Database ${dbName} already exists; skipping`);
      } else {
        logger.log(`Creating database ${dbName}...`);
        await createDatabase(client, dbName);
        logger.log(`Created database ${dbName}`);
      }

      for (const user of postgresRunConfig.users ?? []) {
        const shouldGrantAccess =
          user.databases?.includes('*') || user.databases?.includes(dbName);

        if (shouldGrantAccess) {
          await grantDatabasePermissions(
            postgresRunConfig,
            user.username,
            [dbName],
            logger
          );
        }
      }
    }

    logger.log('Database setup completed successfully');
  } finally {
    await client.end();
  }
}
