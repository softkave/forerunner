import fs from 'fs';
import {ensureFile} from 'fs-extra';
import path from 'path';
import {convertToArray} from 'softkave-js-utils';
import z from 'zod';
import {MongoUserListSchema} from './user/types.js';
import {isLocalhostname} from './utils.js';

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

export type InstanceHostnameEntry = z.infer<typeof InstanceHostnameEntrySchema>;

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

export const mongoRunConfigSchema = z
  .object({
    // Working dir
    workingDir: z.string(),

    // Mongo version
    mongoVersion: z.string().optional(),

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
  })
  .refine(
    data =>
      data.ports.length === data.hostnames.length && data.ports.length >= 3,
    {
      message: 'ports and hostnames must have the same length (minimum 3)',
    }
  );

export type MongoRunConfig = z.infer<typeof mongoRunConfigSchema>;

export function getCachedMongoRunConfigFilepath(params: {
  mongoRunConfig: MongoRunConfig;
}) {
  const {mongoRunConfig} = params;
  return path.join(mongoRunConfig.workingDir, 'mongo-run-config.json');
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
