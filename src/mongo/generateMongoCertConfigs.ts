import assert from 'assert';
import {Command} from 'commander';
import fs from 'fs';
import {ensureFile, exists} from 'fs-extra';
import {flattenDeep, uniq} from 'lodash-es';
import path from 'path';
import {convertToArray} from 'softkave-js-utils';
import {CAConfig, CertConfig} from '../certs/types.js';
import {getMongoRunConfig, MongoRunConfig} from './mongoRunConfig.js';
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

  const hostname0 = hostnames[0] as string | undefined;
  assert.ok(hostname0, 'hostname0 must be set');
  const firstNonLocalHostname = getFirstNonLocalhostBindIp({bindIp: hostname0});
  const cn = firstNonLocalHostname || hostname0;
  assert.ok(cn, 'cn must be set');
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
      key: 'mongod.key.pem',
      cert: 'mongod.crt.pem',
      csr: 'mongod.csr.pem',
      fullchain: 'mongod-chain.pem',
      crtAndKey: 'mongod.crt.key.pem',
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
  for (let i = 1; i <= mongoRunConfig.replicaCount; i++) {
    await generateCertConfigForMongod({
      instanceNumber: i,
      caConfig,
      mongoRunConfig,
      overwrite,
    });
  }
}

// Check if this module is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const program = new Command();

  program
    .requiredOption('-c, --config <path>', 'Path to mongoRunConfig file')
    .option('-o, --overwrite', 'Overwrite existing cert configs', false)
    .parse(process.argv);

  const options = program.opts();
  const overwrite = !!options.overwrite;
  const mongoRunConfig = await getMongoRunConfig({
    mongoRunConfigFilepath: options.config,
    checkExisting: false,
  });

  await generateMongoCertConfigsMain({mongoRunConfig, overwrite});
}
