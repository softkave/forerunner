import fs from 'fs';
import {ensureFile, exists} from 'fs-extra';
import {dump, load} from 'js-yaml';
import path from 'path';
import {z} from 'zod';
import {resolvePathUnderWorkingDir} from '../utils/resolvePathUnderWorkingDir.js';
import {MongoRunConfig} from './mongoRunConfig.js';

/** TLS subsection of `net` used by the generated `mongod` config. */
export interface MongoNetTlsConfig {
  /** TLS mode used by `mongod`. */
  mode: 'requireTLS' | 'preferTLS';
  /** Combined certificate+key PEM file path. */
  certificateKeyFile: string;
  /** CA file path. */
  CAFile: string;
  /** x509 cluster auth attributes (only when `security.clusterAuthMode` is
   * `x509`). */
  clusterAuthX509?: {attributes: string};
  /** Allow clients without certificates (we use this for dev). */
  allowConnectionsWithoutCertificates: boolean;
}

/** Subset of the `mongod` YAML config we generate for Docker runs. */
export interface MongoConfig {
  /** Log settings (`systemLog`). */
  systemLog: {
    destination: 'file';
    path: string;
    logAppend: boolean;
    logRotate: 'rename' | 'reopen';
  };
  /** Process settings (`processManagement`). */
  processManagement: {fork: boolean};
  /** Network settings (`net`). */
  net: {
    bindIp: string;
    port: number;
    tls?: MongoNetTlsConfig;
  };
  /** Security settings (`security`). */
  security: {
    authorization: 'enabled' | 'disabled';
    transitionToAuth?: boolean;
    keyFile?: string;
    clusterAuthMode?: 'x509' | 'keyFile' | 'sendX509';
  };
  /** Replica set settings (`replication`). */
  replication?: {replSetName: string};
  /** Storage settings (`storage`). */
  storage: {dbPath: string};
}

/** Subset of the `mongod` YAML config we generate for Docker runs. */
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
        clusterAuthX509: z
          .object({
            attributes: z.string(),
          })
          .optional(),
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

export function getMongodDockerConfigFilePath(
  mongoRunConfig: MongoRunConfig,
  /** Instance number (1-based) */
  instanceNumber: number
) {
  return resolvePathUnderWorkingDir(
    mongoRunConfig.workingDir,
    path.join('mongo-configs', `mongod-${instanceNumber}.docker.conf`)
  );
}

export function getMongodConfigDir(mongoRunConfig: MongoRunConfig) {
  return resolvePathUnderWorkingDir(mongoRunConfig.workingDir, 'mongo-configs');
}

export function getMongodSystemLogFilePath(
  mongoRunConfig: MongoRunConfig,
  /** Instance number (1-based) */
  instanceNumber: number
) {
  return resolvePathUnderWorkingDir(
    mongoRunConfig.workingDir,
    path.join('mongo-system-logs', `mongod-${instanceNumber}.log`)
  );
}

export function getMongodDataDir(
  mongoRunConfig: MongoRunConfig,
  /** Instance number (1-based) */
  instanceNumber: number
) {
  return resolvePathUnderWorkingDir(
    mongoRunConfig.workingDir,
    path.join('mongo-data', `mongod-${instanceNumber}`)
  );
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

  if (!mongoRunConfig.caConfig) {
    throw new Error('caConfig is required for generating mongod config');
  }

  const configFilePath = getMongodDockerConfigFilePath(
    mongoRunConfig,
    instanceNumber
  );

  if ((await exists(configFilePath)) && !overwrite) {
    const config = load(await fs.promises.readFile(configFilePath, 'utf8'));
    return config as MongoConfig;
  }

  const authEnabled = mongoRunConfig.authorization !== 'disabled';

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
        ...(authEnabled
          ? {
              clusterAuthX509: {
                attributes: `O=${mongoRunConfig.caConfig.subject.O}`,
              },
            }
          : {}),
        allowConnectionsWithoutCertificates: true,
      },
    },
    storage: {
      dbPath: '/data/db',
    },
    security: {
      authorization: authEnabled ? 'enabled' : 'disabled',
      transitionToAuth: false,
      ...(authEnabled ? {clusterAuthMode: 'x509' as const} : {}),
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
