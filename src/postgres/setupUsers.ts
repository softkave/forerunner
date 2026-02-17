import {Client} from 'pg';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {PostgresRunConfig} from './postgresRunConfig.js';
import {
  generatePgHbaEntriesForUser,
  generateRandomPassword,
  getPostgresClient,
  readPgHbaConf,
  readPostgresConfig,
  reloadPostgresConfigViaClient,
  setPostgresConfPasswordEncryption,
  writePgHbaConf,
  writePostgresConfig,
} from './utils.js';

async function checkIfUserExists(
  client: Client,
  username: string
): Promise<boolean> {
  const result = await client.query(
    'SELECT 1 FROM pg_user WHERE usename = $1',
    [username]
  );
  return result.rows.length > 0;
}

async function createUser(
  client: Client,
  username: string,
  password?: string
): Promise<void> {
  if (password) {
    await client.query(
      `CREATE USER ${client.escapeIdentifier(username)} WITH PASSWORD $1`,
      [password]
    );
  } else {
    await client.query(`CREATE USER ${client.escapeIdentifier(username)}`);
  }
}

async function setUserPassword(
  client: Client,
  username: string,
  password: string
): Promise<void> {
  await client.query(
    `ALTER USER ${client.escapeIdentifier(username)} WITH PASSWORD $1`,
    [password]
  );
}

function pgHbaUsesScram(content: string): boolean {
  return (
    /^local\s+all\s+all\s+scram-sha-256$/m.test(content) ||
    /^host\s+all\s+all\s+.*\s+scram-sha-256$/m.test(content)
  );
}

function pgHbaUsesTrust(content: string): boolean {
  return (
    /^local\s+all\s+all\s+trust$/m.test(content) ||
    /^host\s+all\s+all\s+.*\s+trust$/m.test(content)
  );
}

/**
 * Grant database permissions to a user
 * Note: Schema-level privileges must be granted while connected to the target database
 * because schemas are database-scoped in PostgreSQL
 */
async function grantDatabasePermissions(
  postgresRunConfig: PostgresRunConfig,
  username: string,
  databases: string[] | undefined,
  logger: IForeLogger
): Promise<void> {
  if (!databases || databases.length === 0) {
    // No specific databases - user already has access to all (default)
    return;
  }

  // Get a client connected to the postgres database for cluster-level grants
  const adminClient = await getPostgresClient({
    postgresRunConfig,
    database: 'postgres',
  });

  try {
    for (const db of databases) {
      try {
        // Grant CONNECT privilege (cluster-level, can be done from any database)
        await adminClient.query(
          `GRANT CONNECT ON DATABASE ${adminClient.escapeIdentifier(db)} TO ${adminClient.escapeIdentifier(username)}`
        );
        // Grant CREATE privilege on database to allow user to create schemas (namespaces)
        await adminClient.query(
          `GRANT CREATE ON DATABASE ${adminClient.escapeIdentifier(db)} TO ${adminClient.escapeIdentifier(username)}`
        );

        // For schema-level privileges, we MUST connect to the target database
        // because schemas are database-scoped - each database has its own 'public' schema
        const dbClient = await getPostgresClient({
          postgresRunConfig,
          database: db,
        });

        try {
          // These grants are scoped to THIS database's public schema only.
          // Grant usage and create privileges on the public schema (allows user
          // to use and create objects in the schema)
          await dbClient.query(
            `GRANT USAGE, CREATE ON SCHEMA public TO ${dbClient.escapeIdentifier(username)}`
          );
          // Grant all privileges on all current tables in the public schema
          await dbClient.query(
            `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${dbClient.escapeIdentifier(username)}`
          );
          // Grant all privileges on all current sequences in the public schema
          await dbClient.query(
            `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${dbClient.escapeIdentifier(username)}`
          );
          // Ensure user gets all privileges on tables created in the future in
          // the public schema
          await dbClient.query(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${dbClient.escapeIdentifier(username)}`
          );
          // Ensure user gets all privileges on sequences created in the future
          // in the public schema
          await dbClient.query(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${dbClient.escapeIdentifier(username)}`
          );
          logger.log(
            `Granted permissions on database ${db} to user ${username}`
          );
        } finally {
          await dbClient.end();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.log(
          `Warning: Could not grant permissions on database ${db} to user ${username}: ${msg}`
        );
      }
    }
  } finally {
    await adminClient.end();
  }
}

async function syncAllUsers(
  client: Client,
  postgresRunConfig: PostgresRunConfig,
  users: Array<{username: string; password?: string; databases?: string[]}>,
  logger: IForeLogger
): Promise<void> {
  for (const user of users) {
    const exists = await checkIfUserExists(client, user.username);
    if (exists) {
      if (user.password) {
        await setUserPassword(client, user.username, user.password);
        logger.log(`Updated password for user ${user.username}`);
      }
    } else {
      await createUser(client, user.username, user.password);
      logger.log(
        `Created user ${user.username}${user.password ? ' with password' : ''}`
      );
    }

    // Grant database permissions (requires separate database connections)
    await grantDatabasePermissions(
      postgresRunConfig,
      user.username,
      user.databases,
      logger
    );
  }
}

export async function setupUsers(params: {
  postgresRunConfig: PostgresRunConfig;
  logger?: IForeLogger;
}) {
  const {postgresRunConfig, logger = new ConsoleForeLogger({silent: true})} =
    params;

  if (!postgresRunConfig.users || postgresRunConfig.users.length === 0) {
    logger.log('No users in config; skipping user setup');
    return;
  }

  const authEnabled = postgresRunConfig.authorization === 'enabled';
  const containerName = postgresRunConfig.containerName;

  const client = await getPostgresClient({
    postgresRunConfig,
    database: 'postgres',
  });

  try {
    let pgHbaContent: string;
    let postgresConfContent: string;
    try {
      pgHbaContent = readPgHbaConf(containerName);
      postgresConfContent = readPostgresConfig(containerName);
    } catch (err) {
      logger.log(
        `Could not read pg config: ${err instanceof Error ? err.message : String(err)}`
      );
      pgHbaContent = '';
      postgresConfContent = '';
    }

    // Generate pg_hba.conf entries for all users with database-specific access
    const sslEnabled = postgresRunConfig.ssl === 'enabled';
    const authMethod = authEnabled ? 'scram-sha-256' : 'trust';
    const pgHbaEntries: string[] = [];

    // Generate entries for each user
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

    // Authorization was enabled, now disabled: set pg_hba to trust and reload
    if (!authEnabled && pgHbaContent && pgHbaUsesScram(pgHbaContent)) {
      logger.log(
        'Transitioning from scram to trust (authorization disabled)...'
      );
      // Generate new pg_hba.conf with user-specific entries
      const newPgHba = pgHbaEntries.join('\n') + '\n';
      writePgHbaConf(containerName, newPgHba);
      await reloadPostgresConfigViaClient(client);
      logger.log(
        'Updated pg_hba.conf to trust with user-specific entries and reloaded'
      );
    }

    // Authorization was disabled, now enabled: sync users first (so we don't lock out), then pg_hba to scram
    let didSyncForScramTransition = false;
    if (authEnabled && pgHbaContent && pgHbaUsesTrust(pgHbaContent)) {
      logger.log(
        'Transitioning from trust to scram (authorization enabled)...'
      );
      await syncAllUsers(
        client,
        postgresRunConfig,
        postgresRunConfig.users,
        logger
      );
      didSyncForScramTransition = true;
      // Generate new pg_hba.conf with user-specific entries
      const newPgHba = pgHbaEntries.join('\n') + '\n';
      const updatedConf =
        setPostgresConfPasswordEncryption(postgresConfContent);
      writePgHbaConf(containerName, newPgHba);
      writePostgresConfig(containerName, updatedConf);
      await reloadPostgresConfigViaClient(client);
      logger.log(
        'Updated pg_hba and postgresql.conf to scram-sha-256 with user-specific entries and reloaded'
      );
    }

    // Sync all users from config (skip if already done during scram transition)
    if (!didSyncForScramTransition) {
      await syncAllUsers(
        client,
        postgresRunConfig,
        postgresRunConfig.users,
        logger
      );
    }

    // Update pg_hba.conf with user-specific database entries if not already done
    if (!didSyncForScramTransition && authEnabled) {
      const newPgHba = pgHbaEntries.join('\n') + '\n';
      // Only update if content has changed
      if (newPgHba.trim() !== pgHbaContent.trim()) {
        writePgHbaConf(containerName, newPgHba);
        await reloadPostgresConfigViaClient(client);
        logger.log('Updated pg_hba.conf with user-specific database entries');
      }
    }

    // When authorization enabled and postgres not in user list: set postgres superuser to random (unusable)
    if (authEnabled) {
      const postgresInConfig = postgresRunConfig.users.some(
        u => u.username === 'postgres'
      );
      if (!postgresInConfig) {
        const randomPw = generateRandomPassword();
        await setUserPassword(client, 'postgres', randomPw);
        logger.log(
          'Set postgres superuser to random password (not in user list)'
        );
      }
    }

    logger.log('User setup completed successfully');
  } finally {
    await client.end();
  }
}
