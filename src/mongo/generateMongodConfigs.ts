import fs from 'fs';
import {ensureFile, exists} from 'fs-extra';
import {dump, load} from 'js-yaml';
import path from 'path';
import {z} from 'zod';
import {MongoRunConfig} from './mongoRunConfig.js';

export const MongoConfigSchema = z.object({
  systemLog: z.object({
    destination: z.literal('file'),
    path: z.string(),
    logAppend: z.boolean(),
    logRotate: z.enum(['rename', 'reopen']),
  }),
  processManagement: z.object({
    fork: z.boolean(),
  }),
  net: z.object({
    bindIp: z.string(),
    port: z.number(),
    tls: z
      .object({
        mode: z.enum(['requireTLS', 'preferTLS']),
        certificateKeyFile: z.string(),
        // clusterFile: z.string(),
        CAFile: z.string(),
        // clusterCAFile: z.string(),
        clusterAuthX509: z.object({
          attributes: z.string(),
        }),
        allowConnectionsWithoutCertificates: z.boolean(),
      })
      .optional(),
  }),
  security: z.object({
    authorization: z.enum(['enabled', 'disabled']),
    transitionToAuth: z.boolean().optional(),
    keyFile: z.string().optional(),
    clusterAuthMode: z.enum(['x509', 'keyFile', 'sendX509']).optional(),
  }),
  replication: z
    .object({
      replSetName: z.string(),
    })
    .optional(),
  storage: z.object({
    dbPath: z.string(),
  }),
});

export type MongoConfig = z.infer<typeof MongoConfigSchema>;

export function getMongodDockerConfigFilePath(
  mongoRunConfig: MongoRunConfig,
  /** Instance number (1-based) */
  instanceNumber: number
) {
  return path.resolve(
    path.join(
      mongoRunConfig.workingDir,
      'mongo-configs',
      `mongod-${instanceNumber}.docker.conf`
    )
  );
}

export function getMongodConfigDir(mongoRunConfig: MongoRunConfig) {
  return path.resolve(path.join(mongoRunConfig.workingDir, 'mongo-configs'));
}

export function getMongodSystemLogFilePath(
  mongoRunConfig: MongoRunConfig,
  /** Instance number (1-based) */
  instanceNumber: number
) {
  const dir = path.join(
    mongoRunConfig.workingDir,
    'mongo-system-logs',
    `mongod-${instanceNumber}.log`
  );

  return dir;
}

export function getMongodDataDir(
  mongoRunConfig: MongoRunConfig,
  /** Instance number (1-based) */
  instanceNumber: number
) {
  const dir = path.join(
    mongoRunConfig.workingDir,
    'mongo-data',
    `mongod-${instanceNumber}`
  );
  return dir;
}

/**
 * Generates a mongod config file with container paths for use when starting
 * mongod inside Docker. The config is written to mongod-{instanceNumber}.docker.conf.
 */
export async function generateMongoDockerConfigForMongod(params: {
  /** Instance number (1-based) */
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  overwrite?: boolean;
}) {
  const {instanceNumber, mongoRunConfig, overwrite = true} = params;
  const configFilePath = getMongodDockerConfigFilePath(
    mongoRunConfig,
    instanceNumber
  );
  if ((await exists(configFilePath)) && !overwrite) {
    const config = load(await fs.promises.readFile(configFilePath, 'utf8'));
    return config as MongoConfig;
  }

  const config: MongoConfig = {
    systemLog: {
      destination: 'file',
      logAppend: true,
      logRotate: 'rename',
      path: `/var/log/mongodb/mongod-${instanceNumber}.log`,
    },
    net: {
      port: mongoRunConfig.ports[instanceNumber - 1],
      bindIp: ['0.0.0.0'].join(','),
      tls: {
        certificateKeyFile: `/certs/mongod-${instanceNumber}.crt.key.pem`,
        CAFile: '/certs/ca.crt.pem',
        mode: 'requireTLS' as const,
        clusterAuthX509: {
          attributes: `O=${mongoRunConfig.caConfig.subject.O}`,
        },
        allowConnectionsWithoutCertificates: true,
      },
    },
    storage: {
      dbPath: '/data/db',
    },
    security: {
      clusterAuthMode: 'x509' as const,
      authorization:
        mongoRunConfig.authorization !== 'disabled' ? 'enabled' : 'disabled',
      transitionToAuth: false,
    },
    processManagement: {
      fork: false,
    },
  };

  if (mongoRunConfig.replicaSetName) {
    config.replication = {
      replSetName: mongoRunConfig.replicaSetName,
    };
  }

  await ensureFile(configFilePath);
  await fs.promises.writeFile(configFilePath, dump(config, {lineWidth: 120}));
  return config;
}
