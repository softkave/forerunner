import fs from 'fs';
import {ensureFile, exists} from 'fs-extra';
import {isEqual} from 'lodash-es';
import path from 'path';
import {mergeObjects} from 'softkave-js-utils';
import z from 'zod';
import {MongoUserListSchema} from './setupMongoUsers.js';

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
  bindLocalhost: z.boolean().optional(),
  instancePorts: z.array(z.number()),
  replicaCount: z.number().min(3, 'Replica count must be at least 3'),
  replicaSetName: z.string(),

  // Mongo users
  users: MongoUserListSchema,
});

export type MongoRunConfig = z.infer<typeof mongoRunConfigSchema>;

export function getWorkingMongoRunConfigFilepath(params: {
  mongoRunConfig: MongoRunConfig;
}) {
  const {mongoRunConfig} = params;
  return path.join(mongoRunConfig.workingDir, 'mongo-run-config.json');
}

export async function getMongoRunConfig(params: {
  mongoRunConfigFilepath: string;
  checkExisting: boolean;
}) {
  const {mongoRunConfigFilepath, checkExisting = true} = params;
  const mongoRunConfig = mongoRunConfigSchema.parse(
    JSON.parse(await fs.promises.readFile(mongoRunConfigFilepath, 'utf8'))
  );

  if (checkExisting) {
    const workingMongoRunConfigFilepath = getWorkingMongoRunConfigFilepath({
      mongoRunConfig,
    });
    if (!(await exists(workingMongoRunConfigFilepath))) {
      await ensureFile(workingMongoRunConfigFilepath);
      await fs.promises.writeFile(
        workingMongoRunConfigFilepath,
        JSON.stringify(mongoRunConfig, null, 2)
      );
      return mongoRunConfig;
    }

    const existingMongoRunConfig = mongoRunConfigSchema.parse(
      JSON.parse(
        await fs.promises.readFile(workingMongoRunConfigFilepath, 'utf8')
      )
    );
    const hasDiff = !isEqual(existingMongoRunConfig, mongoRunConfig);
    if (hasDiff) {
      const mergedMongoRunConfig = mergeObjects(
        existingMongoRunConfig,
        mongoRunConfig,
        {arrayUpdateStrategy: 'replace'}
      );
      await fs.promises.writeFile(
        workingMongoRunConfigFilepath,
        JSON.stringify(mergedMongoRunConfig, null, 2)
      );
      return mergedMongoRunConfig;
    }

    return existingMongoRunConfig;
  }

  return mongoRunConfig;
}
