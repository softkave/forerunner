import z from 'zod';

/**
 * Self-managed deployment built-in role names (MongoDB manual).
 * Excludes internal-only `__system` (not for application users).
 *
 * @see https://www.mongodb.com/docs/manual/reference/built-in-roles/?deployment-type=self
 */
export const MONGO_SELF_MANAGED_BUILTIN_ROLES = [
  'backup',
  'clusterAdmin',
  'clusterManager',
  'clusterMonitor',
  'dbAdmin',
  'dbAdminAnyDatabase',
  'dbOwner',
  'directShardOperations',
  'enableSharding',
  'hostManager',
  'read',
  'readAnyDatabase',
  'readWrite',
  'readWriteAnyDatabase',
  'restore',
  'root',
  'searchCoordinator',
  'userAdmin',
  'userAdminAnyDatabase',
] as const;

/** Union of known self-managed built-in role names; custom roles still use `string`. */
export type MongoBuiltInRole =
  (typeof MONGO_SELF_MANAGED_BUILTIN_ROLES)[number];

/**
 * Zod enum for built-in role names only.
 * Pair with `.or(z.string())` when the value may be a user-defined role.
 */
export const MongoBuiltInRoleNameSchema = z.enum(
  MONGO_SELF_MANAGED_BUILTIN_ROLES
);

/** A single role grant for a MongoDB user. */
export interface MongoUserRole {
  /** Role name (built-in role or custom role). */
  role: MongoBuiltInRole | string;
  /** Database the role applies to (e.g. `admin`, app db). */
  db: string;
}

/** Single MongoDB user entry for run config `users`. */
export interface MongoUser {
  /** Username to create/update. */
  username: string;
  /** Plaintext password to set/rotate. */
  password: string;
  /** Authentication database (defaults to `admin` when omitted by callers). */
  authDb?: string;
  /** Role grants applied to this user. */
  roles: MongoUserRole[];
}

/** List of `MongoUser` entries. */
export type MongoUserList = MongoUser[];

/** Single MongoDB user entry for run config `users`. */
export const MongoUserSchema = z.object({
  username: z.string(),
  password: z.string(),
  authDb: z.string().optional(),
  roles: z.array(
    z.object({
      role: MongoBuiltInRoleNameSchema.or(z.string()),
      db: z.string(),
    })
  ),
});

/** Array form of `MongoUserSchema` (run config `users`). */
export const MongoUserListSchema = z.array(MongoUserSchema);
