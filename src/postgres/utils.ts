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

export async function getPostgresClient(params: {
  postgresRunConfig: PostgresRunConfig;
  user?: {username: string; password?: string};
  database?: string;
}): Promise<Client> {
  const {postgresRunConfig, user, database} = params;

  const effectiveUser =
    user ?? getAuthUserFromConfig(postgresRunConfig) ?? undefined;

  const client = new Client({
    host: '127.0.0.1',
    port: postgresRunConfig.port,
    user: effectiveUser?.username ?? 'postgres',
    password: effectiveUser?.password ?? undefined,
    database: database ?? postgresRunConfig.dbs?.[0] ?? 'postgres',
  });

  await client.connect();
  return client;
}
