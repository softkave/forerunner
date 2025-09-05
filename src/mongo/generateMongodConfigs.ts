import assert from 'assert';
import fs from 'fs';
import {ensureFile, exists} from 'fs-extra';
import {dump, load} from 'js-yaml';
import path from 'path';
import {convertToArray} from 'softkave-js-utils';
import {z} from 'zod';
import {CAConfig, CertConfig} from '../certs/types.js';
import {
  generateCAConfigForMongo,
  generateCertConfigForMongod,
} from './generateMongoCertConfigs.js';
import {MongoRunConfig} from './mongoRunConfig.js';

export const MongoConfigSchema = z.object({
  systemLog: z.object({
    destination: z.literal('file'),
    path: z.string(),
    logAppend: z.boolean(),
  }),
  processManagement: z.object({
    fork: z.boolean(),
  }),
  net: z.object({
    bindIp: z.string(),
    port: z.number(),
    tls: z.object({
      mode: z.enum(['requireTLS', 'preferTLS']),
      certificateKeyFile: z.string(),
      // clusterFile: z.string(),
      CAFile: z.string(),
      // clusterCAFile: z.string(),
      clusterAuthX509: z.object({
        attributes: z.string(),
      }),
      allowConnectionsWithoutCertificates: z.boolean(),
    }),
  }),
  security: z.object({
    authorization: z.literal('enabled'),
    keyFile: z.string().optional(),
    clusterAuthMode: z.literal('x509'),
  }),
  replication: z.object({
    replSetName: z.string(),
  }),
  storage: z.object({
    dbPath: z.string(),
  }),
});

export type MongoConfig = z.infer<typeof MongoConfigSchema>;

export function getMongodConfigFilePath(
  mongoRunConfig: MongoRunConfig,
  instanceNumber: number
) {
  const dir = path.join(
    mongoRunConfig.workingDir,
    'mongo-configs',
    `mongod-${instanceNumber}.conf`
  );

  return dir;
}

export function getMongodSystemLogFilePath(
  mongoRunConfig: MongoRunConfig,
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
  instanceNumber: number
) {
  const dir = path.join(
    mongoRunConfig.workingDir,
    'mongo-data',
    `mongod-${instanceNumber}`
  );
  return dir;
}

export async function generateMongoConfigForMongod(params: {
  instanceNumber: number;
  mongoCertConfig: CertConfig;
  caConfig: CAConfig;
  overwrite?: boolean;
  mongoRunConfig: MongoRunConfig;
}) {
  const configFilePath = getMongodConfigFilePath(
    params.mongoRunConfig,
    params.instanceNumber
  );
  if ((await exists(configFilePath)) && !params.overwrite) {
    const config = load(await fs.promises.readFile(configFilePath, 'utf8'));
    return config;
  }

  const port = params.mongoRunConfig.instancePorts[params.instanceNumber - 1];
  assert.ok(port, 'port must be set');

  let hostnames = convertToArray(
    params.mongoRunConfig.instancesHostnames[params.instanceNumber - 1]
  );
  if (params.mongoRunConfig.bindLocalhost) {
    hostnames = [...hostnames, 'localhost', '127.0.0.1'];
  }
  const bindIp = hostnames;
  const config: MongoConfig = {
    systemLog: {
      destination: 'file',
      logAppend: true,
      path: getMongodSystemLogFilePath(
        params.mongoRunConfig,
        params.instanceNumber
      ),
    },
    net: {
      port,
      bindIp: bindIp.join(','),
      tls: {
        certificateKeyFile: `${params.mongoCertConfig.outDir}/${params.mongoCertConfig.files.crtAndKey}`,
        CAFile: `${params.caConfig.outDir}/${params.caConfig.files.cert}`,
        // clusterFile: `${params.mongoCertConfig.outDir}/${params.mongoCertConfig.files.cert}`,
        // clusterCAFile: `${params.caConfig.outDir}/${params.caConfig.files.cert}`,
        mode: 'preferTLS',
        clusterAuthX509: {
          attributes: `O=${params.mongoCertConfig.subject.O}`,
        },
        allowConnectionsWithoutCertificates: true,
      },
    },
    storage: {
      dbPath: getMongodDataDir(params.mongoRunConfig, params.instanceNumber),
    },
    security: {
      // keyFile: `${params.mongoCertConfig.outDir}/${params.mongoCertConfig.files.key}`,
      clusterAuthMode: 'x509',
      authorization: 'enabled',
    },
    processManagement: {
      // we handle starting a background process for each mongod instance
      // ourselves
      fork: false,
    },
    replication: {
      replSetName: params.mongoRunConfig.replicaSetName,
    },
  };

  await ensureFile(configFilePath);
  await fs.promises.writeFile(configFilePath, dump(config, {lineWidth: 120}));
  return config;
}

export async function generateMongodConfigsMain(params: {
  mongoRunConfig: MongoRunConfig;
  overwrite?: boolean;
}) {
  const {mongoRunConfig, overwrite} = params;
  const caConfig = await generateCAConfigForMongo({overwrite, mongoRunConfig});
  for (let i = 1; i <= mongoRunConfig.replicaCount; i++) {
    const mongoCertConfig = await generateCertConfigForMongod({
      instanceNumber: i,
      caConfig,
      mongoRunConfig,
    });
    await generateMongoConfigForMongod({
      instanceNumber: i,
      mongoRunConfig,
      mongoCertConfig,
      caConfig,
      overwrite,
    });
  }
}
