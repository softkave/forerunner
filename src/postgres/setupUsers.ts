import {Client} from 'pg';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {PostgresRunConfig} from './postgresRunConfig.js';
import {
  generateRandomPassword,
  getPostgresClient,
  readPgHbaConf,
  readPostgresConfig,
  reloadPostgresConfigViaClient,
  setPgHbaToScram,
  setPgHbaToTrust,
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

async function syncAllUsers(
  client: Client,
  users: Array<{username: string; password?: string}>,
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

    // Authorization was enabled, now disabled: set pg_hba to trust and reload
    if (!authEnabled && pgHbaContent && pgHbaUsesScram(pgHbaContent)) {
      logger.log(
        'Transitioning from scram to trust (authorization disabled)...'
      );
      const updated = setPgHbaToTrust(pgHbaContent);
      writePgHbaConf(containerName, updated);
      await reloadPostgresConfigViaClient(client);
      logger.log('Updated pg_hba.conf to trust and reloaded');
    }

    // Authorization was disabled, now enabled: sync users first (so we don't lock out), then pg_hba to scram
    let didSyncForScramTransition = false;
    if (authEnabled && pgHbaContent && pgHbaUsesTrust(pgHbaContent)) {
      logger.log(
        'Transitioning from trust to scram (authorization enabled)...'
      );
      await syncAllUsers(client, postgresRunConfig.users, logger);
      didSyncForScramTransition = true;
      const updatedHba = setPgHbaToScram(pgHbaContent);
      const updatedConf =
        setPostgresConfPasswordEncryption(postgresConfContent);
      writePgHbaConf(containerName, updatedHba);
      writePostgresConfig(containerName, updatedConf);
      await reloadPostgresConfigViaClient(client);
      logger.log(
        'Updated pg_hba and postgresql.conf to scram-sha-256 and reloaded'
      );
    }

    // Sync all users from config (skip if already done during scram transition)
    if (!didSyncForScramTransition) {
      await syncAllUsers(client, postgresRunConfig.users, logger);
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
