import assert from 'assert';
import fs from 'fs';
import {ensureFile, exists} from 'fs-extra';
import {flattenDeep, uniq} from 'lodash-es';
import path from 'path';
import {convertToArray} from 'softkave-js-utils';
import {CAConfig, CertConfig} from '../certs/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {generateMongoPassword, getFirstNonLocalhostBindIp} from './utils.js';

export function getMongoCertCAConfigFilePath(mongoRunConfig: MongoRunConfig) {
  const dir = path.join(
    mongoRunConfig.workingDir,
    'mongo-certs-configs',
    'mongo-certs-ca-config.json'
  );

  return dir;
}

export function getMongoCertConfigFilePath(
  mongoRunConfig: MongoRunConfig,
  instanceNumber: number
) {
  const dir = path.join(
    mongoRunConfig.workingDir,
    'mongo-certs-configs',
    `mongo-certs-mongod-${instanceNumber}-config.json`
  );

  return dir;
}

export function getMongoCertOutDir(mongoRunConfig: MongoRunConfig) {
  const dir = path.join(mongoRunConfig.workingDir, 'mongo-certs-out');

  return dir;
}

export async function generateCAConfigForMongo(params: {
  overwrite?: boolean;
  mongoRunConfig: MongoRunConfig;
}): Promise<CAConfig> {
  const configFilePath = getMongoCertCAConfigFilePath(params.mongoRunConfig);
  if ((await exists(configFilePath)) && !params.overwrite) {
    const config = JSON.parse(
      await fs.promises.readFile(configFilePath, 'utf8')
    );
    return config;
  }

  const password = generateMongoPassword();
  const mongoCAConfig: CAConfig = {
    ...params.mongoRunConfig.caConfig,
    passphrase: params.mongoRunConfig.caConfig.passphrase || password,
    outDir: getMongoCertOutDir(params.mongoRunConfig),
    files: {
      key: 'ca.key.pem',
      cert: 'ca.crt.pem',
      csr: 'ca.csr.pem',
      chain: 'ca-chain.pem',
    },
  };

  await ensureFile(configFilePath);
  await fs.promises.writeFile(
    configFilePath,
    JSON.stringify(mongoCAConfig, null, 2)
  );
  return mongoCAConfig;
}

export async function generateCertConfigForMongod(params: {
  caConfig: CAConfig;
  overwrite?: boolean;
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
}) {
  const configFilePath = getMongoCertConfigFilePath(
    params.mongoRunConfig,
    params.instanceNumber
  );
  if ((await exists(configFilePath)) && !params.overwrite) {
    const config = JSON.parse(
      await fs.promises.readFile(configFilePath, 'utf8')
    );
    return config;
  }

  let hostnames = convertToArray(
    params.mongoRunConfig.instancesHostnames[params.instanceNumber - 1]
  );
  if (params.mongoRunConfig.bindLocalhost) {
    hostnames = [...hostnames, 'localhost', '127.0.0.1'];
  }

  assert.ok(
    hostnames.length > 0,
    `instanceHostnames or bindLocalhost must be set for instance ${params.instanceNumber}`
  );

  const hostname0 = hostnames[0] as string | undefined;
  assert.ok(hostname0, 'hostname or bindLocalhost must be set');
  const firstNonLocalHostname = getFirstNonLocalhostBindIp({bindIp: hostname0});
  const cn = firstNonLocalHostname || hostname0;
  const san = uniq(
    flattenDeep(params.mongoRunConfig.instancesHostnames).concat(hostnames)
  );
  const mongoCertConfig: CertConfig = {
    outDir: getMongoCertOutDir(params.mongoRunConfig),
    days: params.caConfig.days,
    subject: {
      ...params.caConfig.subject,
      CN: cn,
    },
    san,
    files: {
      key: `mongod-${params.instanceNumber}.key.pem`,
      cert: `mongod-${params.instanceNumber}.crt.pem`,
      csr: `mongod-${params.instanceNumber}.csr.pem`,
      fullchain: `mongod-${params.instanceNumber}-chain.pem`,
      crtAndKey: `mongod-${params.instanceNumber}.crt.key.pem`,
    },
    ca: {
      dir: params.caConfig.outDir,
      passphrase: params.caConfig.passphrase,
    },
  };

  await ensureFile(configFilePath);
  await fs.promises.writeFile(
    configFilePath,
    JSON.stringify(mongoCertConfig, null, 2)
  );
  return mongoCertConfig;
}

export async function generateMongoCertConfigsMain(params: {
  mongoRunConfig: MongoRunConfig;
  overwrite?: boolean;
}) {
  const {mongoRunConfig, overwrite} = params;
  const caConfig = await generateCAConfigForMongo({overwrite, mongoRunConfig});
  for (let i = 1; i <= mongoRunConfig.instancePorts.length; i++) {
    await generateCertConfigForMongod({
      instanceNumber: i,
      caConfig,
      mongoRunConfig,
      overwrite,
    });
  }
}
