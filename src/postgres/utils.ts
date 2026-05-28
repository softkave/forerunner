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

export async function readPostgresConfig(
  containerName: string
): Promise<string> {
  return await execInContainer(containerName, [
    'cat',
    '/var/lib/postgresql/data/postgresql.conf',
  ]);
}

export async function writePostgresConfig(
  containerName: string,
  content: string
): Promise<void> {
  // Use base64 encoding to safely pass content through docker exec
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  await execInContainer(containerName, [
    'bash',
    '-c',
    `echo '${encoded}' | base64 -d > /var/lib/postgresql/data/postgresql.conf`,
  ]);
}

export async function readPgHbaConf(containerName: string): Promise<string> {
  return await execInContainer(containerName, [
    'cat',
    '/var/lib/postgresql/data/pg_hba.conf',
  ]);
}

export async function writePgHbaConf(
  containerName: string,
  content: string
): Promise<void> {
  // Use base64 encoding to safely pass content through docker exec
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  await execInContainer(containerName, [
    'bash',
    '-c',
    `echo '${encoded}' | base64 -d > /var/lib/postgresql/data/pg_hba.conf`,
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

/**
 * Generate pg_hba.conf entries for a user with specific database access
 */
export function generatePgHbaEntriesForUser(params: {
  username: string;
  databases: string[] | undefined;
  authMethod: 'trust' | 'scram-sha-256';
  requireSSL?: boolean;
  connectionTypes?: ('tcp' | 'local')[];
}): string {
  const {
    username,
    databases,
    authMethod,
    requireSSL = false,
    connectionTypes = ['tcp', 'local'], // Default: allow both
  } = params;
  const entries: string[] = [];
  const allowTCP = connectionTypes.includes('tcp');
  const allowLocal = connectionTypes.includes('local');
  const connectionType = requireSSL ? 'hostssl' : 'host';

  // Docker bridge: when host connects via -p 127.0.0.1:port:5432, container
  // sees client as 172.17.0.1
  const tcpAddresses = [
    '127.0.0.1/32',
    '::1/128',
    '172.17.0.0/16', // Docker default bridge
  ];

  if (databases && databases.length > 0) {
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
 * Waits for PostgreSQL to become ready and accept connections
 * @param params.postgresRunConfig - PostgreSQL run configuration
 * @param params.containerName - Docker container name
 * @param params.port - PostgreSQL port
 * @param params.sslEnabled - Whether SSL is enabled
 * @param params.logger - Logger instance
 * @param params.maxAttempts - Maximum number of connection attempts (default: 10)
 * @param params.retryIntervalMs - Interval between retry attempts in milliseconds (default: 1000)
 * @throws Error if PostgreSQL does not become ready within maxAttempts * retryIntervalMs
 */
export async function waitForPostgresReady(params: {
  postgresRunConfig: PostgresRunConfig;
  containerName: string;
  port: number;
  sslEnabled: boolean;
  logger?: IForeLogger;
  maxAttempts?: number;
  retryIntervalMs?: number;
}): Promise<void> {
  const {
    postgresRunConfig,
    containerName,
    port,
    sslEnabled,
    logger,
    maxAttempts = 10,
    retryIntervalMs = 1000,
  } = params;

  logger?.log(`Waiting for PostgreSQL to begin listening...`);

  const authUser = getAuthUserFromConfig(postgresRunConfig);
  const firstUser = postgresRunConfig.users?.[0];
  let attempts = 0;

  while (attempts < maxAttempts) {
    if (await isContainerRunning(containerName)) {
      try {
        const clientConfig: ConstructorParameters<typeof Client>[0] = {
          host: '127.0.0.1',
          port: port,
          user: authUser?.username ?? firstUser?.username ?? 'postgres',
          password: authUser?.password ?? firstUser?.password ?? undefined,
          database: postgresRunConfig.dbs?.[0] ?? 'postgres',
          connectionTimeoutMillis: 2000,
        };
        if (sslEnabled) {
          clientConfig.ssl = {rejectUnauthorized: false};
        }
        const client = new Client(clientConfig);
        await client.connect();
        await client.end();
        logger?.log('PostgreSQL is ready');
        return;
      } catch {
        // Not ready yet, continue waiting
      }
    }
    await new Promise(resolve => setTimeout(resolve, retryIntervalMs));
    attempts++;
  }

  throw new Error(
    `PostgreSQL container ${containerName} did not become ready within ${maxAttempts} attempts (${maxAttempts * retryIntervalMs}ms)`
  );
}
