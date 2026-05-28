import assert from 'assert';
import fs from 'fs';
import {ensureFile, exists} from 'fs-extra';
import path from 'path';
import {CAConfig, CertConfig} from '../certs/types.js';
import {resolvePathUnderWorkingDir} from '../utils/resolvePathUnderWorkingDir.js';
import {PostgresRunConfig} from './postgresRunConfig.js';
import {generateRandomPassword} from './utils.js';

/** Cert output directory name, relative to run config `workingDir`. */
export const POSTGRES_CERTS_OUT_DIR = 'postgres-certs-out';

export function getPostgresCertOutDir(): string {
  return POSTGRES_CERTS_OUT_DIR;
}

export async function resolvePostgresCertOutDir(
  postgresRunConfig: PostgresRunConfig
): Promise<string> {
  const configPath = getPostgresCertCAConfigFilePath(postgresRunConfig);
  if (await exists(configPath)) {
    try {
      const config = JSON.parse(
        await fs.promises.readFile(configPath, 'utf8')
      ) as CAConfig;
      if (config.outDir) {
        return resolvePathUnderWorkingDir(
          postgresRunConfig.workingDir,
          config.outDir
        );
      }
    } catch {
      // fall through to default
    }
  }
  return resolvePathUnderWorkingDir(
    postgresRunConfig.workingDir,
    POSTGRES_CERTS_OUT_DIR
  );
}

export function getPostgresCertCAConfigFilePath(
  postgresRunConfig: PostgresRunConfig
) {
  return resolvePathUnderWorkingDir(
    postgresRunConfig.workingDir,
    path.join('postgres-certs-configs', 'postgres-certs-ca-config.json')
  );
}

export function getPostgresCertConfigFilePath(
  postgresRunConfig: PostgresRunConfig
) {
  return resolvePathUnderWorkingDir(
    postgresRunConfig.workingDir,
    path.join('postgres-certs-configs', 'postgres-server-cert-config.json')
  );
}

export async function generateCAConfigForPostgres(params: {
  overwrite?: boolean;
  postgresRunConfig: PostgresRunConfig;
}): Promise<CAConfig> {
  const configFilePath = getPostgresCertCAConfigFilePath(
    params.postgresRunConfig
  );
  if ((await exists(configFilePath)) && !params.overwrite) {
    const config = JSON.parse(
      await fs.promises.readFile(configFilePath, 'utf8')
    );
    return config;
  }

  assert.ok(params.postgresRunConfig.caConfig, 'CA config is required');
  const password = generateRandomPassword();
  const postgresCAConfig: CAConfig = {
    passphrase: params.postgresRunConfig.caConfig.passphrase ?? password,
    outDir: getPostgresCertOutDir(),
    days: params.postgresRunConfig.caConfig.days,
    subject: params.postgresRunConfig.caConfig.subject,
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
    JSON.stringify(postgresCAConfig, null, 2)
  );
  return postgresCAConfig;
}

export async function generateCertConfigForPostgres(params: {
  caConfig: CAConfig;
  overwrite?: boolean;
  postgresRunConfig: PostgresRunConfig;
}): Promise<CertConfig> {
  const configFilePath = getPostgresCertConfigFilePath(
    params.postgresRunConfig
  );
  if ((await exists(configFilePath)) && !params.overwrite) {
    const config = JSON.parse(
      await fs.promises.readFile(configFilePath, 'utf8')
    );
    return config;
  }

  const hostname = 'localhost';
  const san = [
    'localhost',
    '127.0.0.1',
    params.postgresRunConfig.containerName,
  ];

  const postgresCertConfig: CertConfig = {
    outDir: getPostgresCertOutDir(),
    days: params.caConfig.days,
    subject: {
      ...params.caConfig.subject,
      CN: hostname,
    },
    san,
    files: {
      key: 'server.key.pem',
      cert: 'server.crt.pem',
      csr: 'server.csr.pem',
      fullchain: 'server-fullchain.pem',
    },
    ca: {
      dir: params.caConfig.outDir,
      passphrase: params.caConfig.passphrase,
    },
  };

  await ensureFile(configFilePath);
  await fs.promises.writeFile(
    configFilePath,
    JSON.stringify(postgresCertConfig, null, 2)
  );
  return postgresCertConfig;
}

export async function generatePostgresCertConfigsMain(params: {
  postgresRunConfig: PostgresRunConfig;
  overwrite?: boolean;
}) {
  const {postgresRunConfig, overwrite} = params;
  const caConfig = await generateCAConfigForPostgres({
    overwrite,
    postgresRunConfig,
  });
  await generateCertConfigForPostgres({
    caConfig,
    postgresRunConfig,
    overwrite,
  });
}
