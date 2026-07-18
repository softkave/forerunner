import crypto from 'crypto';
import {generate} from 'generate-password';
import {Client} from 'pg';
import {execInContainer, isContainerRunning} from '../utils/docker.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {getAuthUserFromConfig, PostgresRunConfig} from './postgresRunConfig.js';

export {
  containerExists,
  ensureDockerAvailable,
  execInContainer,
  isContainerRunning,
  volumeExists,
} from '../utils/docker.js';

/** PostgreSQL 18+ uses versioned data directories under /var/lib/postgresql. */
export function getPostgresMajorVersion(postgresVersion: string): number {
  return parseInt(postgresVersion.split('.')[0] ?? postgresVersion, 10);
}

export function getPostgresVolumeMountPath(postgresVersion: string): string {
  return getPostgresMajorVersion(postgresVersion) >= 18
    ? '/var/lib/postgresql'
    : '/var/lib/postgresql/data';
}

export function getPostgresDataDirPath(postgresVersion: string): string {
  const majorVersion = getPostgresMajorVersion(postgresVersion);
  return majorVersion >= 18
    ? `/var/lib/postgresql/${majorVersion}/docker`
    : '/var/lib/postgresql/data';
}

export async function readPostgresConfig(params: {
  containerName: string;
  postgresVersion: string;
}): Promise<string> {
  const {containerName, postgresVersion} = params;
  const dataDir = getPostgresDataDirPath(postgresVersion);
  return await execInContainer(containerName, [
    'cat',
    `${dataDir}/postgresql.conf`,
  ]);
}

export async function writePostgresConfig(params: {
  containerName: string;
  postgresVersion: string;
  content: string;
}): Promise<void> {
  const {containerName, postgresVersion, content} = params;
  const dataDir = getPostgresDataDirPath(postgresVersion);
  // Use base64 encoding to safely pass content through docker exec
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  await execInContainer(containerName, [
    'bash',
    '-c',
    `echo '${encoded}' | base64 -d > ${dataDir}/postgresql.conf`,
  ]);
}

export async function readPgHbaConf(params: {
  containerName: string;
  postgresVersion: string;
}): Promise<string> {
  const {containerName, postgresVersion} = params;
  const dataDir = getPostgresDataDirPath(postgresVersion);
  return await execInContainer(containerName, [
    'cat',
    `${dataDir}/pg_hba.conf`,
  ]);
}

export async function writePgHbaConf(params: {
  containerName: string;
  postgresVersion: string;
  content: string;
}): Promise<void> {
  const {containerName, postgresVersion, content} = params;
  const dataDir = getPostgresDataDirPath(postgresVersion);
  // Use base64 encoding to safely pass content through docker exec
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  await execInContainer(containerName, [
    'bash',
    '-c',
    `echo '${encoded}' | base64 -d > ${dataDir}/pg_hba.conf`,
  ]);
}

export async function reloadPostgresConfig(
  containerName: string
): Promise<void> {
  await execInContainer(containerName, [
    'psql',
    '-U',
    'postgres',
    '-c',
    'SELECT pg_reload_conf();',
  ]);
}

/**
 * Reload PostgreSQL config using an existing client. Use this when pg_hba
 * has been switched to scram so that docker exec psql would require a password.
 */
export async function reloadPostgresConfigViaClient(
  client: Client
): Promise<void> {
  await client.query('SELECT pg_reload_conf();');
}

export function generateRandomPassword(): string {
  return crypto.randomBytes(32).toString('base64').replace(/[/+=]/g, 'x');
}

export function generatePostgresPassword(): string {
  return generate({
    length: 32,
    numbers: true,
    // Only include URL-safe (RFC3986 "unreserved") symbols.
    // See: https://datatracker.ietf.org/doc/html/rfc3986#section-2.3
    symbols: '-._~',
    uppercase: true,
    strict: true,
  });
}

/** TCP client address CIDRs used in generated `pg_hba.conf` host/hostssl lines. */
export function getPgHbaTcpAddresses(
  discoverability: 'local' | 'global' = 'local'
): string[] {
  // Docker networking note:
  // - On Linux Docker, host->container via published ports often appears as
  //   172.17.0.1 (docker0 gateway).
  // - On Docker Desktop (macOS/Windows), host->container often appears as
  //   192.168.65.1.
  const addresses = [
    '127.0.0.1/32',
    '::1/128',
    '172.17.0.0/16', // Docker default bridge
    '192.168.65.1/32', // Docker Desktop host gateway (common)
  ];
  if (discoverability === 'global') {
    addresses.push('0.0.0.0/0', '::/0');
  }
  return addresses;
}

/**
 * Generate pg_hba.conf entries for a user with specific database access
 */
export function generatePgHbaEntriesForUser(params: {
  username: string;
  databases: string[] | undefined;
  authMethod: 'trust' | 'scram-sha-256';
  requireSSL?: boolean;
  connectionTypes?: ('tcp' | 'local')[];
  /** When `global`, allow remote clients (all IPv4/IPv6). Default `local`. */
  discoverability?: 'local' | 'global';
}): string {
  const {
    username,
    databases,
    authMethod,
    requireSSL = false,
    connectionTypes = ['tcp', 'local'], // Default: allow both
    discoverability = 'local',
  } = params;
  const entries: string[] = [];
  const allowTCP = connectionTypes.includes('tcp');
  const allowLocal = connectionTypes.includes('local');
  const connectionType = requireSSL ? 'hostssl' : 'host';
  const tcpAddresses = getPgHbaTcpAddresses(discoverability);

  const hasWildcardDatabaseAccess = databases?.includes('*') ?? false;

  if (databases && databases.length > 0 && !hasWildcardDatabaseAccess) {
    // User has specific database access
    for (const db of databases) {
      if (allowTCP) {
        for (const addr of tcpAddresses) {
          entries.push(
            `${connectionType} ${db} ${username} ${addr} ${authMethod}`
          );
        }
      }
      if (allowLocal) {
        entries.push(`local ${db} ${username} ${authMethod}`);
      }
    }
  } else {
    // User has access to all databases
    if (allowTCP) {
      for (const addr of tcpAddresses) {
        entries.push(`${connectionType} all ${username} ${addr} ${authMethod}`);
      }
    }
    if (allowLocal) {
      entries.push(`local all ${username} ${authMethod}`);
    }
  }

  return entries.join('\n');
}

/** Build the full `pg_hba.conf` body from a run config's users. */
export function generatePgHbaConfContent(
  postgresRunConfig: PostgresRunConfig
): string {
  const authEnabled = postgresRunConfig.authorization === 'enabled';
  const authMethod = authEnabled ? 'scram-sha-256' : 'trust';
  const sslEnabled = postgresRunConfig.ssl === 'enabled';
  const users = postgresRunConfig.users;

  if (!users?.length) {
    return '';
  }

  const pgHbaEntries = users.map(user =>
    generatePgHbaEntriesForUser({
      username: user.username,
      databases: user.databases,
      authMethod,
      requireSSL: sslEnabled,
      connectionTypes: user.connectionTypes,
      discoverability: postgresRunConfig.discoverability,
    })
  );

  return pgHbaEntries.join('\n') + '\n';
}

/**
 * Returns true when `expected` contains host/hostssl lines missing from
 * `current` (e.g. IPv6 CIDRs added after an older IPv4-only pg_hba).
 */
export function pgHbaConfNeedsUpdate(
  current: string,
  expected: string
): boolean {
  const expectedLines = expected
    .trim()
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (expectedLines.length === 0) {
    return false;
  }

  if (current.trim() === expected.trim()) {
    return false;
  }

  const currentLines = new Set(
    current
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  );

  return expectedLines.some(line => !currentLines.has(line));
}

/** Sync generated `pg_hba.conf` when required IPv4/IPv6 entries are missing. */
export async function syncPgHbaConfFromConfig(params: {
  postgresRunConfig: PostgresRunConfig;
  containerName: string;
  logger?: IForeLogger;
}): Promise<{changed: boolean; content: string}> {
  const {postgresRunConfig, containerName, logger} = params;
  const expected = generatePgHbaConfContent(postgresRunConfig);

  if (!expected) {
    return {changed: false, content: ''};
  }

  const current = await readPgHbaConf({
    containerName,
    postgresVersion: postgresRunConfig.postgresVersion,
  });

  if (!pgHbaConfNeedsUpdate(current, expected)) {
    return {changed: false, content: current};
  }

  await writePgHbaConf({
    containerName,
    postgresVersion: postgresRunConfig.postgresVersion,
    content: expected,
  });
  logger?.log('Updated pg_hba.conf with user-specific database entries');

  return {changed: true, content: expected};
}

export function setPgHbaToScram(content: string): string {
  return content
    .replace(/^(local\s+all\s+all\s+)\S+$/gm, '$1scram-sha-256')
    .replace(/^(host\s+all\s+all\s+.*?)\s+trust$/gm, '$1 scram-sha-256');
}

export function setPgHbaToTrust(content: string): string {
  return content
    .replace(/^(local\s+all\s+all\s+)\S+$/gm, '$1trust')
    .replace(/^(host\s+all\s+all\s+.*?)\s+scram-sha-256$/gm, '$1 trust');
}

export function setPostgresConfPasswordEncryption(content: string): string {
  if (/^password_encryption\s*=\s*scram-sha-256$/m.test(content)) {
    return content;
  }
  if (/^password_encryption\s*=/m.test(content)) {
    return content.replace(
      /^password_encryption\s*=.*$/m,
      'password_encryption = scram-sha-256'
    );
  }
  return content + '\npassword_encryption = scram-sha-256\n';
}

/**
 * Enable SSL in postgresql.conf and set certificate paths
 */
export function setPostgresConfSSL(
  content: string,
  certPath: string,
  keyPath: string,
  caPath: string
): string {
  let result = content;

  // Set ssl = on
  if (/^ssl\s*=\s*on$/m.test(result)) {
    // Already set
  } else if (/^ssl\s*=/m.test(result)) {
    result = result.replace(/^ssl\s*=.*$/m, 'ssl = on');
  } else {
    result = result + '\nssl = on\n';
  }

  // Set ssl_cert_file
  if (/^ssl_cert_file\s*=/m.test(result)) {
    result = result.replace(
      /^ssl_cert_file\s*=.*$/m,
      `ssl_cert_file = '${certPath}'`
    );
  } else {
    result = result + `\nssl_cert_file = '${certPath}'\n`;
  }

  // Set ssl_key_file
  if (/^ssl_key_file\s*=/m.test(result)) {
    result = result.replace(
      /^ssl_key_file\s*=.*$/m,
      `ssl_key_file = '${keyPath}'`
    );
  } else {
    result = result + `\nssl_key_file = '${keyPath}'\n`;
  }

  // Set ssl_ca_file
  if (/^ssl_ca_file\s*=/m.test(result)) {
    result = result.replace(
      /^ssl_ca_file\s*=.*$/m,
      `ssl_ca_file = '${caPath}'`
    );
  } else {
    result = result + `\nssl_ca_file = '${caPath}'\n`;
  }

  return result;
}

/**
 * Require SSL in pg_hba.conf for host connections
 */
export function setPgHbaRequireSSL(content: string): string {
  // Replace 'host' with 'hostssl' for all host entries to require SSL
  // Preserve the rest of the line after 'host'
  return content.replace(/^(host)(\s+)/gm, 'hostssl$2');
}

/**
 * Check if pg_hba.conf requires SSL (has hostssl entries)
 */
export function pgHbaRequiresSSL(content: string): boolean {
  return /^hostssl\s+/m.test(content);
}

export async function getPostgresClient(params: {
  postgresRunConfig: PostgresRunConfig;
  user?: {username: string; password?: string};
  database?: string;
  /** Override config SSL (e.g. false when connecting to configure SSL before it
   * is enabled) */
  ssl?: boolean;
}): Promise<Client> {
  const {postgresRunConfig, user, database, ssl: sslOverride} = params;

  const effectiveUser =
    user ?? getAuthUserFromConfig(postgresRunConfig) ?? undefined;

  const sslEnabled =
    sslOverride !== undefined
      ? sslOverride
      : postgresRunConfig.ssl === 'enabled';

  const clientConfig: ConstructorParameters<typeof Client>[0] = {
    host: '127.0.0.1',
    port: postgresRunConfig.port,
    user: effectiveUser?.username ?? 'postgres',
    password: effectiveUser?.password ?? undefined,
    database: database ?? postgresRunConfig.dbs?.[0] ?? 'postgres',
  };

  if (sslEnabled) {
    clientConfig.ssl = {
      rejectUnauthorized: false,
    };
  }

  const client = new Client(clientConfig);

  await client.connect();
  return client;
}

/**
 * SSL modes to try when probing Postgres readiness.
 * When `ssl` is enabled in config, try non-SSL first (fresh volume), then SSL
 * (existing volume with `hostssl`-only pg_hba).
 */
export function getPostgresConnectionSslModesToTry(
  postgresRunConfig: PostgresRunConfig,
  options?: {requireSsl?: boolean}
): boolean[] {
  if (options?.requireSsl) {
    return [true];
  }
  if (postgresRunConfig.ssl === 'enabled') {
    return [false, true];
  }
  return [false];
}

/**
 * Waits for PostgreSQL to become ready and accept connections
 * @param params.postgresRunConfig - PostgreSQL run configuration
 * @param params.containerName - Docker container name
 * @param params.port - PostgreSQL port
 * @param params.sslEnabled - When true, only attempt SSL connections
 * @param params.logger - Logger instance
 * @param params.maxAttempts - Maximum number of connection attempts (default: 10)
 * @param params.retryIntervalMs - Interval between retry attempts in milliseconds (default: 1000)
 * @returns Whether the successful probe used SSL
 * @throws Error if PostgreSQL does not become ready within maxAttempts * retryIntervalMs
 */
export async function waitForPostgresReady(params: {
  postgresRunConfig: PostgresRunConfig;
  containerName: string;
  port: number;
  sslEnabled?: boolean;
  logger?: IForeLogger;
  maxAttempts?: number;
  retryIntervalMs?: number;
}): Promise<{connectedWithSsl: boolean}> {
  const {
    postgresRunConfig,
    containerName,
    port,
    sslEnabled = false,
    logger,
    maxAttempts = 10,
    retryIntervalMs = 1000,
  } = params;

  logger?.log(`Waiting for PostgreSQL to begin listening...`);

  const authUser = getAuthUserFromConfig(postgresRunConfig);
  const firstUser = postgresRunConfig.users?.[0];
  const sslModes = getPostgresConnectionSslModesToTry(postgresRunConfig, {
    requireSsl: sslEnabled,
  });
  let attempts = 0;

  while (attempts < maxAttempts) {
    if (await isContainerRunning(containerName)) {
      for (const useSsl of sslModes) {
        try {
          const clientConfig: ConstructorParameters<typeof Client>[0] = {
            host: '127.0.0.1',
            port: port,
            user: authUser?.username ?? firstUser?.username ?? 'postgres',
            password: authUser?.password ?? firstUser?.password ?? undefined,
            database: postgresRunConfig.dbs?.[0] ?? 'postgres',
            connectionTimeoutMillis: 2000,
          };
          if (useSsl) {
            clientConfig.ssl = {rejectUnauthorized: false};
          }
          const client = new Client(clientConfig);
          await client.connect();
          await client.end();
          logger?.log(`PostgreSQL is ready${useSsl ? ' (SSL)' : ''}`);
          return {connectedWithSsl: useSsl};
        } catch {
          // Try next SSL mode or wait and retry
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, retryIntervalMs));
    attempts++;
  }

  throw new Error(
    `PostgreSQL container ${containerName} did not become ready within ${maxAttempts} attempts (${
      maxAttempts * retryIntervalMs
    }ms)`
  );
}
