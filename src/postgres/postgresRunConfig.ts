import fs from 'fs';
import {ensureFile} from 'fs-extra';
import path from 'path';
import z from 'zod';
import {CAConfigSchema} from '../certs/types.js';

export const PostgresConnectionTypeSchema = z.enum(['tcp', 'local']);
export type PostgresConnectionType = z.infer<
  typeof PostgresConnectionTypeSchema
>;

export const PostgresUserSchema = z.object({
  username: z.string().min(1, 'username is required'),
  // Optional - if missing, user has no password (trust auth, if no other user
  // has a password)
  password: z.string().optional(),
  // Optional - list of databases this user can connect to and manage
  // If not specified, user can access all databases
  databases: z
    .array(z.string().min(1, 'database name cannot be empty'))
    .optional(),
  // Optional - list of connection types allowed for this user
  // 'tcp' = TCP/IP connections (host/hostssl entries in pg_hba.conf)
  // 'local' = local Unix socket connections (local entries in pg_hba.conf)
  // If not specified, user can connect via both tcp and local
  connectionTypes: z
    .array(PostgresConnectionTypeSchema)
    .min(1, 'At least one connection type must be specified')
    .optional(),
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
  .superRefine((data, ctx) => {
    if (data.authorization !== 'enabled') return;
    const users = data.users;
    if (!users || users.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'When authorization is enabled, at least one user is required',
        path: ['users'],
      });
      return;
    }
    users.forEach((user, index) => {
      if (!user.password || user.password.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `User "${user.username}" must have a password when authorization is enabled`,
          path: ['users', index, 'password'],
        });
      }
    });
  })
  .refine(
    data => {
      if (data.ssl !== 'enabled') return true;
      return data.caConfig !== undefined;
    },
    {
      message: 'caConfig is required when ssl is enabled',
    }
  )
  .superRefine((data, ctx) => {
    // Validate that databases specified for users exist in the dbs list
    if (!data.users || !data.dbs) return;
    const dbSet = new Set(data.dbs);
    data.users.forEach((user, userIndex) => {
      if (user.databases) {
        user.databases.forEach((db, dbIndex) => {
          if (!dbSet.has(db)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `User "${user.username}" references database "${db}" which does not exist in the dbs array.`,
              path: ['users', userIndex, 'databases', dbIndex],
            });
          }
        });
      }
    });
  });

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
