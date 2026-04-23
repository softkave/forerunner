import z from 'zod';

/** Supported built-in roles we special-case for autocomplete (any string is
 * allowed too). */
export type MongoBuiltInRole =
  | 'userAdminAnyDatabase'
  | 'readAnyDatabase'
  | 'clusterAdmin'
  | 'readWrite'
  | 'read';

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
      role: z
        .enum([
          'userAdminAnyDatabase',
          'readAnyDatabase',
          'clusterAdmin',
          'readWrite',
          'read',
        ])
        .or(z.string()),
      db: z.string(),
    })
  ),
});

/** Array form of `MongoUserSchema` (run config `users`). */
export const MongoUserListSchema = z.array(MongoUserSchema);
