import crypto from 'crypto';
import {Client} from 'pg';
import {execInContainer} from '../utils/docker.js';
import {getAuthUserFromConfig, PostgresRunConfig} from './postgresRunConfig.js';

export {
  containerExists,
  ensureDockerAvailable,
  execInContainer,
  isContainerRunning,
  volumeExists,
} from '../utils/docker.js';

export function readPostgresConfig(containerName: string): string {
  return execInContainer(containerName, [
    'cat',
    '/var/lib/postgresql/data/postgresql.conf',
  ]);
}

export function writePostgresConfig(
  containerName: string,
  content: string
): void {
  // Use base64 encoding to safely pass content through docker exec
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  execInContainer(containerName, [
    'bash',
    '-c',
    `echo '${encoded}' | base64 -d > /var/lib/postgresql/data/postgresql.conf`,
  ]);
}

export function readPgHbaConf(containerName: string): string {
  return execInContainer(containerName, [
    'cat',
    '/var/lib/postgresql/data/pg_hba.conf',
  ]);
}

export function writePgHbaConf(containerName: string, content: string): void {
  // Use base64 encoding to safely pass content through docker exec
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  execInContainer(containerName, [
    'bash',
    '-c',
    `echo '${encoded}' | base64 -d > /var/lib/postgresql/data/pg_hba.conf`,
  ]);
}

export function reloadPostgresConfig(containerName: string): void {
  execInContainer(containerName, [
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
}): Promise<Client> {
  const {postgresRunConfig, user, database} = params;

  const effectiveUser =
    user ?? getAuthUserFromConfig(postgresRunConfig) ?? undefined;

  const sslEnabled = postgresRunConfig.ssl === 'enabled';

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
