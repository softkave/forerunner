import fs from 'fs';
import {ensureFile} from 'fs-extra';
import path from 'path';
import z from 'zod';
import {MongoUserListSchema} from './user/types.js';

export const mongoRunConfigSchema = z.object({
  // Working dir
  workingDir: z.string(),

  // Download Mongo
  mongoVersion: z.string().optional(),
  systemLinux: z.string().optional(),
  os: z.string().optional(),

  // Mongo certs
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

  // Mongo configs
  instancesHostnames: z.array(z.string().or(z.array(z.string()))),
  bindLocalhost: z.boolean().default(true).optional(),
  instancePorts: z.array(z.number()),
  replicaCount: z
    .number()
    .min(3, 'Replica count must be at least 3')
    .optional(),
  replicaSetName: z.string().optional(),

  // Authentication and authorization
  users: MongoUserListSchema,
  authorization: z.enum(['enabled', 'disabled']).default('enabled').optional(),
});

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
  const {mongoRunConfigFilepath, cacheConfig = true} = params;
  const mongoRunConfig = mongoRunConfigSchema.parse(
    JSON.parse(await fs.promises.readFile(mongoRunConfigFilepath, 'utf8'))
  );

  if (cacheConfig) {
    await cacheMongoRunConfig({mongoRunConfig});
  }

  return mongoRunConfig;
}
