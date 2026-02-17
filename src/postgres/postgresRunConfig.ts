import fs from 'fs';
import {ensureFile} from 'fs-extra';
import path from 'path';
import z from 'zod';
import {CAConfigSchema} from '../certs/types.js';

export const PostgresUserSchema = z.object({
  username: z.string().min(1, 'username is required'),
  // Optional - if missing, user has no password (trust auth, if no other user
  // has a password)
  password: z.string().optional(),
});

export const PostgresUserListSchema = z.array(PostgresUserSchema);

export type PostgresUser = z.infer<typeof PostgresUserSchema>;
export type PostgresUserList = z.infer<typeof PostgresUserListSchema>;

export const postgresRunConfigSchema = z
  .object({
    // Working dir
    workingDir: z.string().optional(),

    // Port
    port: z.number().int().positive('Port must be a positive integer'),

    // Authorization: when enabled, local and TCP require password (scram-sha-256)
    authorization: z.enum(['enabled', 'disabled']).optional(),

    // SSL: when enabled, connections require SSL/TLS
    ssl: z.enum(['enabled', 'disabled']).optional(),

    // CA config for SSL certificates (required when ssl is enabled)
    caConfig: CAConfigSchema.optional(),

    // Users - when authorization enabled: at least one required (admin), all need password
    users: PostgresUserListSchema.optional(),

    // PostgreSQL version
    postgresVersion: z.string().optional(),

    // Container name
    containerName: z.string().min(1, 'containerName is required'),

    // Volume name (defaults to containerName)
    volumeName: z.string().optional(),

    // Databases - first is POSTGRES_DB
    dbs: z.array(z.string().min(1, 'database name cannot be empty')).optional(),

    // Whether to keep data across restarts
    keep: z.boolean().optional(),
  })
  .transform(data => ({
    ...data,
    workingDir: data.workingDir ?? process.cwd(),
    postgresVersion: data.postgresVersion ?? '16',
    volumeName: data.volumeName ?? data.containerName,
    keep: data.keep ?? false,
    authorization: data.authorization ?? 'disabled',
    ssl: data.ssl ?? 'disabled',
  }))
  .refine(
    data => {
      if (data.authorization !== 'enabled') return true;
      const users = data.users;
      if (!users || users.length === 0) {
        return false;
      }
      return users.every(
        u => typeof u.password === 'string' && u.password.length > 0
      );
    },
    {
      message:
        'When authorization is enabled, at least one user is required and all users must have a password',
    }
  )
  .refine(
    data => {
      if (data.ssl !== 'enabled') return true;
      return data.caConfig !== undefined;
    },
    {
      message: 'caConfig is required when ssl is enabled',
    }
  );

export type PostgresRunConfig = z.infer<typeof postgresRunConfigSchema>;

/**
 * Returns the user to use for authenticated DB operations (setup-users, setup-dbs, etc.).
 * When authorization is enabled: postgres if in users list, else first user (both must have password).
 * When authorization is disabled: first user if present, else undefined (use postgres with trust).
 */
export function getAuthUserFromConfig(
  config: PostgresRunConfig
): {username: string; password?: string} | undefined {
  const users = config.users;
  if (!users || users.length === 0) return undefined;
  if (config.authorization === 'enabled') {
    const postgresUser = users.find(u => u.username === 'postgres');
    if (postgresUser?.password) {
      return {username: postgresUser.username, password: postgresUser.password};
    }
    const first = users[0];
    return first?.password
      ? {username: first.username, password: first.password}
      : undefined;
  }
  const first = users[0];
  return first
    ? {username: first.username, password: first.password}
    : undefined;
}

export function getCachedPostgresRunConfigFilepath(params: {
  postgresRunConfig: PostgresRunConfig;
}) {
  const {postgresRunConfig} = params;
  return path.join(postgresRunConfig.workingDir, 'postgres-run-config.json');
}

export async function getCachedPostgresRunConfig(params: {
  postgresRunConfig: PostgresRunConfig;
}) {
  const {postgresRunConfig} = params;
  const cachedPostgresRunConfigFilepath = getCachedPostgresRunConfigFilepath({
    postgresRunConfig,
  });
  return postgresRunConfigSchema.parse(
    JSON.parse(
      await fs.promises.readFile(cachedPostgresRunConfigFilepath, 'utf8')
    )
  );
}

export async function cachePostgresRunConfig(params: {
  postgresRunConfig: PostgresRunConfig;
}) {
  const {postgresRunConfig} = params;
  const cachedPostgresRunConfigFilepath = getCachedPostgresRunConfigFilepath({
    postgresRunConfig,
  });
  await ensureFile(cachedPostgresRunConfigFilepath);
  await fs.promises.writeFile(
    cachedPostgresRunConfigFilepath,
    JSON.stringify(postgresRunConfig, null, 2)
  );
}

export async function getPostgresRunConfig(params: {
  postgresRunConfigFilepath: string;
  cacheConfig?: boolean;
}) {
  const {postgresRunConfigFilepath, cacheConfig = false} = params;
  const postgresRunConfig = postgresRunConfigSchema.parse(
    JSON.parse(await fs.promises.readFile(postgresRunConfigFilepath, 'utf8'))
  );

  if (cacheConfig) {
    await cachePostgresRunConfig({postgresRunConfig});
  }

  return postgresRunConfig;
}
