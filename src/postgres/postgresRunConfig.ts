import fs from 'fs';
import {ensureFile} from 'fs-extra';
import path from 'path';
import z from 'zod';
import {CAConfig, CAConfigSchema} from '../certs/types.js';

/** Connection mode used for `pg_hba.conf` entries. */
export const PostgresConnectionTypeSchema = z.enum(['tcp', 'local']);
/** Type for `PostgresConnectionTypeSchema` (explicit for editor autocomplete). */
export type PostgresConnectionType = 'tcp' | 'local';

/** Postgres user definition used in run config `users`. */
export interface PostgresUser {
  /** Role/user name. */
  username: string;
  /**
   * Password for scram-sha-256.
   * Required when `authorization: "enabled"`.
   */
  password?: string;
  /**
   * Databases this user can access.
   * If omitted, user can access all databases.
   */
  databases?: string[];
  /**
   * Allowed connection types for this user.
   * If omitted, both `tcp` and `local` are allowed.
   */
  connectionTypes?: PostgresConnectionType[];
}

/** List of `PostgresUser` entries. */
export type PostgresUserList = PostgresUser[];

/** User definition used by `setup-users` and `pg_hba.conf` generation. */
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

/** Array form of `PostgresUserSchema` (run config `users`). */
export const PostgresUserListSchema = z.array(PostgresUserSchema);

/** Full run config schema (defaults + cross-field validation). */
export const postgresRunConfigSchema = z
  .object({
    workingDir: z.string().optional(),
    port: z.number().int().positive('Port must be a positive integer'),
    authorization: z.enum(['enabled', 'disabled']).optional(),
    ssl: z.enum(['enabled', 'disabled']).optional(),
    // Only allow CA inputs; `outDir` and `files` are auto-generated later.
    caConfig: CAConfigSchema.pick({
      days: true,
      subject: true,
      passphrase: true,
    }).optional(),
    users: PostgresUserListSchema.optional(),
    postgresVersion: z.string().optional(),
    containerName: z.string().min(1, 'containerName is required'),
    volumeName: z.string().optional(),
    dbs: z.array(z.string().min(1, 'database name cannot be empty')).optional(),
    keep: z.boolean().optional(),
    discoverability: z.enum(['local', 'global']).optional(),
    labels: z.record(z.string().min(1), z.string()).optional(),
  })
  .transform(data => ({
    ...data,
    workingDir: data.workingDir ?? process.cwd(),
    postgresVersion: data.postgresVersion ?? '16',
    volumeName: data.volumeName ?? data.containerName,
    keep: data.keep ?? false,
    authorization: data.authorization ?? 'disabled',
    ssl: data.ssl ?? 'disabled',
    discoverability: data.discoverability ?? 'local',
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

export interface PostgresRunConfig {
  /** Working directory for certs and config cache. */
  workingDir: string;
  /** Port exposed on the host for the Postgres container. */
  port: number;
  /** Whether password auth is required (scram-sha-256) or trust is used. */
  authorization: 'enabled' | 'disabled';
  /** Whether SSL/TLS is required for connections. */
  ssl: 'enabled' | 'disabled';
  /** CA config used when `ssl: "enabled"`. */
  caConfig?: Pick<CAConfig, 'days' | 'subject' | 'passphrase'>;
  /** Users to create/sync (admin first). */
  users?: PostgresUserList;
  /** Postgres image major version (defaulted by schema). */
  postgresVersion: string;
  /** Docker container name. */
  containerName: string;
  /** Docker volume name (defaults to `containerName`). */
  volumeName: string;
  /** Databases to create (first becomes `POSTGRES_DB`). */
  dbs?: string[];
  /** Whether to keep data volumes across restarts. */
  keep: boolean;
  /** Port binding mode (`local` binds 127.0.0.1; `global` binds all). */
  discoverability: 'local' | 'global';
  /** Optional Docker labels applied to the container on start. */
  labels?: Record<string, string>;
}

/**
 * Returns the user to use for authenticated DB operations (setup-users,
 * setup-dbs, etc.). When authorization is enabled: postgres if in users list,
 * else first user (both must have password). When authorization is disabled:
 * first user if present, else undefined (use postgres with trust).
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
