import assert from 'assert';
import fs from 'fs';
import {ensureFile, exists} from 'fs-extra';
import {chmod} from 'fs/promises';
import {uniq} from 'lodash-es';
import path from 'path';
import {CAConfig, CertConfig} from '../certs/types.js';
import {resolvePathUnderWorkingDir} from '../utils/resolvePathUnderWorkingDir.js';
import {extractHostnames, MongoRunConfig} from './mongoRunConfig.js';
import {generateMongoPassword, getFirstNonLocalhostBindIp} from './utils.js';

/** Cert output directory name, relative to run config `workingDir`. */
export const MONGO_CERTS_OUT_DIR = 'mongo-certs-out';

export function getMongoCertOutDir(): string {
  return MONGO_CERTS_OUT_DIR;
}

export async function resolveMongoCertOutDir(
  mongoRunConfig: MongoRunConfig
): Promise<string> {
  const configPath = getMongoCertCAConfigFilePath(mongoRunConfig);
  if (await exists(configPath)) {
    try {
      const config = JSON.parse(
        await fs.promises.readFile(configPath, 'utf8')
      ) as CAConfig;
      if (config.outDir) {
        return resolvePathUnderWorkingDir(
          mongoRunConfig.workingDir,
          config.outDir
        );
      }
    } catch {
      // fall through to default
    }
  }
  return resolvePathUnderWorkingDir(
    mongoRunConfig.workingDir,
    MONGO_CERTS_OUT_DIR
  );
}

export function getMongoCertCAConfigFilePath(mongoRunConfig: MongoRunConfig) {
  return resolvePathUnderWorkingDir(
    mongoRunConfig.workingDir,
    path.join('mongo-certs-configs', 'mongo-certs-ca-config.json')
  );
}

export function getMongoCertConfigFilePath(
  mongoRunConfig: MongoRunConfig,
  instanceNumber: number
) {
  return resolvePathUnderWorkingDir(
    mongoRunConfig.workingDir,
    path.join(
      'mongo-certs-configs',
      `mongo-certs-mongod-${instanceNumber}-config.json`
    )
  );
}

export async function generateCAConfigForMongo(params: {
  overwrite?: boolean;
  mongoRunConfig: MongoRunConfig;
}): Promise<CAConfig> {
  if (!params.mongoRunConfig.caConfig) {
    throw new Error('caConfig is required for certificate generation');
  }
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
    passphrase: params.mongoRunConfig.caConfig.passphrase ?? password,
    outDir: getMongoCertOutDir(),
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

  const entry = params.mongoRunConfig.hostnames[params.instanceNumber - 1];
  let hostnames = extractHostnames(entry ?? []);
  hostnames = [...hostnames, 'localhost', '127.0.0.1'];

  const hostname0 = hostnames[0] as string | undefined;
  assert.ok(
    hostname0,
    `hostname not set for instance ${params.instanceNumber}`
  );
  const firstNonLocalHostname = getFirstNonLocalhostBindIp({bindIp: hostname0});
  const cn = firstNonLocalHostname || hostname0;
  // Collect all hostnames from all instances for SAN
  const allHostnames = params.mongoRunConfig.hostnames.flatMap(e =>
    extractHostnames(e ?? [])
  );
  const san = uniq(allHostnames.concat(hostnames));
  const mongoCertConfig: CertConfig = {
    outDir: getMongoCertOutDir(),
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

/**
 * Mongod refuses to use TLS PEMs that are group/world-readable (same as
 * Postgres). Applies to server keys and combined cert+key files in
 * `mongo-certs-out`.
 */
export async function ensureMongoSslCertPermissions(
  mongoRunConfig: MongoRunConfig
): Promise<void> {
  const certDir = await resolveMongoCertOutDir(mongoRunConfig);
  if (!(await exists(certDir))) {
    return;
  }
  const names = await fs.promises.readdir(certDir);
  await Promise.all(
    names
      .filter(
        name => name.endsWith('.key.pem') || name.endsWith('.crt.key.pem')
      )
      .map(name => chmod(path.join(certDir, name), 0o600))
  );
}

export async function generateMongoCertConfigsMain(params: {
  mongoRunConfig: MongoRunConfig;
  overwrite?: boolean;
}) {
  const {mongoRunConfig, overwrite} = params;
  const caConfig = await generateCAConfigForMongo({overwrite, mongoRunConfig});
  for (let i = 1; i <= mongoRunConfig.ports.length; i++) {
    await generateCertConfigForMongod({
      instanceNumber: i,
      caConfig,
      mongoRunConfig,
      overwrite,
    });
  }
}
