import fs from 'fs';
import {ensureFile} from 'fs-extra';
import {convertToArray} from 'softkave-js-utils';
import z from 'zod';
import {CAConfig} from '../certs/types.js';
import {resolvePathUnderWorkingDir} from '../utils/resolvePathUnderWorkingDir.js';
import {MongoUser, MongoUserListSchema} from './user/types.js';
import {isLocalhostname} from './utils.js';

/** How a hostname should be resolved by containers. */
export type HostnameResolution = 'dns' | 'local';

/** Object form of an instance hostname entry. */
export interface InstanceHostnameObject {
  /** Hostname (must be non-empty). */
  hostname: string;
  /** `dns` hostnames are not bound to Docker bridge; `local` are. */
  resolution: HostnameResolution;
}

/**
 * Hostname entry format supported by config for each MongoDB instance.
 *
 * - **string**: single hostname
 * - **InstanceHostnameObject**: hostname + resolution
 * - **array**: multiple hostnames; items can be strings or objects
 */
export type InstanceHostnameEntry =
  | string
  | InstanceHostnameObject
  | Array<string | InstanceHostnameObject>;

/**
 * Schema for a single instance hostname entry.
 * Supports backwards compatibility with string/string[] and new object format.
 * Arrays can mix strings and objects.
 */
export const InstanceHostnameEntrySchema = z.union([
  z.string(),
  z.array(
    z.union([
      z.string(),
      z.object({
        hostname: z.string().min(1, 'hostname is required'),
        resolution: z.enum(['dns', 'local']),
      }),
    ])
  ),
  z.object({
    hostname: z.string().min(1, 'hostname is required'),
    resolution: z.enum(['dns', 'local']),
  }),
]);

/**
 * Extract hostnames (strings) from an InstanceHostnameEntry.
 * Used by code that expects string[] for backwards compatibility.
 */
export function extractHostnames(entry: InstanceHostnameEntry): string[] {
  entry = convertToArray(entry);
  return entry.map(item => {
    if (typeof item === 'string') {
      return item;
    }
    // It's an object with hostname/resolution
    return item.hostname;
  });
}

/**
 * Extract hostnames that should be bound to Docker bridge (resolution missing
 * or 'local', not 'dns'). Only non-localhost hostnames are returned.
 */
export function extractHostnamesForDockerBinding(
  entry: InstanceHostnameEntry
): string[] {
  entry = convertToArray(entry);
  return entry
    .map(item => {
      if (typeof item === 'string') {
        return isLocalhostname(item) ? null : item;
      }
      // Object entry: bind only if resolution is missing or 'local' (not 'dns')
      if (item.resolution && item.resolution === 'dns') {
        return null;
      }
      return isLocalhostname(item.hostname) ? null : item.hostname;
    })
    .filter((h): h is string => h !== null);
}

/** Full MongoDB run config schema (replica set only). */
export const mongoRunConfigSchema = z
  .object({
    // Working dir
    workingDir: z.string(),

    // Mongo version
    mongoVersion: z.string().default('8.2.3'),

    // Container name (optional, for backwards compatibility)
    containerName: z.string().optional(),

    // Mongo certs (required; SSL/TLS is always enabled)
    caConfig: z.object({
      days: z.number().int().positive('Days must be a positive integer'),
      subject: z.object({
        C: z.string().length(2, 'Country code must be 2 characters'),
        ST: z.string().min(1, 'State is required'),
        L: z.string().min(1, 'Locality is required'),
        O: z.string().min(1, 'Organization is required'),
        CN: z.string().min(1, 'Common Name is required'),
      }),
      passphrase: z.string().optional(),
    }),

    // Mongo configs: instance count is derived from hostnames.length /
    // ports.length (must match, min 3). Each entry can be: string, string[],
    // {hostname, resolution}, or array of {hostname, resolution}
    hostnames: z.array(InstanceHostnameEntrySchema),
    ports: z.array(z.number()),
    replicaSetName: z.string().min(1, 'replicaSetName is required'),

    // Authentication and authorization
    users: MongoUserListSchema,
    authorization: z
      .enum(['enabled', 'disabled'])
      .default('enabled')
      .optional(),

    // Optional Docker labels added to each mongod container on start.
    labels: z.record(z.string().min(1), z.string()).optional(),

    // Optional Docker network for inter-container discovery (container
    // hostnames).
    dockerNetwork: z.string().min(1).optional(),

    /** How to handle missing /etc/hosts entries before replica set setup. */
    etcHostsSetup: z.enum(['prompt', 'add', 'manual', 'skip']).optional(),

    /** IP used when adding /etc/hosts entries (defaults to 127.0.0.1 for
     *  local Docker; set to the host LAN address when clients reach published
     *  ports via a non-loopback address). */
    etcHostsIp: z.string().min(1).optional(),
  })
  .refine(
    data =>
      data.ports.length === data.hostnames.length && data.ports.length >= 3,
    {
      message: 'ports and hostnames must have the same length (minimum 3)',
    }
  )
  .refine(
    data => {
      if (data.authorization === 'disabled') {
        return true;
      }
      const hasAdmin = data.users.some(user =>
        user.roles.some(role => role.role === 'userAdminAnyDatabase')
      );
      const hasClusterAdmin = data.users.some(user =>
        user.roles.some(role => role.role === 'clusterAdmin')
      );
      return hasAdmin && hasClusterAdmin;
    },
    {
      message:
        'When authorization is enabled, both an admin user with the userAdminAnyDatabase role and a cluster admin user with the clusterAdmin role are required',
    }
  );

export interface MongoRunConfig {
  /** Working directory where configs/logs/data are written. */
  workingDir: string;
  /** MongoDB version used for download/run (defaults to '8.2.3'). */
  mongoVersion?: string;
  /** Optional container name (backwards compatibility). */
  containerName?: string;
  /** CA config used for instance cert generation (SSL/TLS is always enabled). */
  caConfig?: Pick<CAConfig, 'days' | 'subject' | 'passphrase'>;
  /** Hostnames (one entry per instance, minimum 3; supports multiple formats). */
  hostnames: InstanceHostnameEntry[];
  /** Ports (one per instance; length must match `hostnames`, minimum 3). */
  ports: number[];
  /** Replica set name. */
  replicaSetName: string;
  /** Users to create/sync in MongoDB. */
  users: MongoUser[];
  /** Whether authorization is enabled (defaults to `enabled`). */
  authorization?: 'enabled' | 'disabled';
  /** Optional Docker labels applied to each `mongod` container. */
  labels?: Record<string, string>;
  /** Optional Docker network for inter-container hostname discovery. */
  dockerNetwork?: string;
  /** How to handle missing /etc/hosts entries before replica set setup. */
  etcHostsSetup?: 'prompt' | 'add' | 'manual' | 'skip';
  /** IP used when adding /etc/hosts entries (defaults to 127.0.0.1 for local
   *  Docker; set to the host LAN address for remote clients). */
  etcHostsIp?: string;
}

export function getCachedMongoRunConfigFilepath(params: {
  mongoRunConfig: MongoRunConfig;
}) {
  const {mongoRunConfig} = params;
  return resolvePathUnderWorkingDir(
    mongoRunConfig.workingDir,
    'mongo-run-config.json'
  );
}

export async function getCachedMongoRunConfig(params: {
  mongoRunConfig: MongoRunConfig;
}) {
  const {mongoRunConfig} = params;
  const cachedMongoRunConfigFilepath = getCachedMongoRunConfigFilepath({
    mongoRunConfig,
  });
  return mongoRunConfigSchema.parse(
    JSON.parse(await fs.promises.readFile(cachedMongoRunConfigFilepath, 'utf8'))
  );
}

export async function cacheMongoRunConfig(params: {
  mongoRunConfig: MongoRunConfig;
}) {
  const {mongoRunConfig} = params;
  const cachedMongoRunConfigFilepath = getCachedMongoRunConfigFilepath({
    mongoRunConfig,
  });
  await ensureFile(cachedMongoRunConfigFilepath);
  await fs.promises.writeFile(
    cachedMongoRunConfigFilepath,
    JSON.stringify(mongoRunConfig, null, 2)
  );
}

export async function getMongoRunConfig(params: {
  mongoRunConfigFilepath: string;
  cacheConfig?: boolean;
}) {
  const {mongoRunConfigFilepath, cacheConfig = false} = params;
  const mongoRunConfig = mongoRunConfigSchema.parse(
    JSON.parse(await fs.promises.readFile(mongoRunConfigFilepath, 'utf8'))
  );

  if (cacheConfig) {
    await cacheMongoRunConfig({mongoRunConfig});
  }

  return mongoRunConfig;
}
