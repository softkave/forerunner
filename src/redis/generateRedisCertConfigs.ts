import fs from 'fs';
import {ensureFile} from 'fs-extra';
import {uniq} from 'lodash-es';
import path from 'path';
import {CAConfig, CertConfig} from '../certs/types.js';
import {generateMongoPassword} from '../mongo/utils.js';
import {getRedisCertOutDir} from './paths.js';
import {RedisRunConfig} from './redisRunConfig.js';
import {getRedisTopology} from './topology.js';

export function getRedisCertCAConfigFilePath(params: {
  redisRunConfig: Pick<RedisRunConfig, 'workingDir'>;
}) {
  const certOutDir = getRedisCertOutDir(params.redisRunConfig);
  return path.join(certOutDir, 'redis-ca-config.json');
}

export function getRedisCertConfigFilePath(params: {
  redisRunConfig: Pick<RedisRunConfig, 'workingDir'>;
}) {
  const certOutDir = getRedisCertOutDir(params.redisRunConfig);
  return path.join(certOutDir, 'redis-cert-config.json');
}

export async function generateCAConfigForRedis(params: {
  redisRunConfig: RedisRunConfig;
  overwrite?: boolean;
}): Promise<CAConfig> {
  const {redisRunConfig, overwrite} = params;
  const configFilePath = getRedisCertCAConfigFilePath({redisRunConfig});
  const certOutDir = getRedisCertOutDir(redisRunConfig);

  if (!overwrite) {
    try {
      const existing = JSON.parse(
        await fs.promises.readFile(configFilePath, 'utf8')
      );
      return existing;
    } catch {
      // fall through
    }
  }

  const passphrase = generateMongoPassword();
  const caConfig: CAConfig = {
    outDir: certOutDir,
    days: 3650,
    subject: {
      C: 'US',
      ST: 'Delaware',
      L: 'Dover',
      O: 'softkave',
      CN: 'softkave Redis CA',
    },
    files: {
      key: 'ca.key.pem',
      cert: 'ca.crt.pem',
      csr: 'ca.csr.pem',
      chain: 'ca-chain.pem',
    },
    passphrase,
  };

  await ensureFile(configFilePath);
  await fs.promises.writeFile(
    configFilePath,
    JSON.stringify(caConfig, null, 2)
  );
  return caConfig;
}

export async function generateCertConfigForRedis(params: {
  redisRunConfig: RedisRunConfig;
  caConfig: CAConfig;
  overwrite?: boolean;
}): Promise<CertConfig> {
  const {redisRunConfig, caConfig, overwrite} = params;
  const configFilePath = getRedisCertConfigFilePath({redisRunConfig});
  const certOutDir = getRedisCertOutDir(redisRunConfig);

  if (!overwrite) {
    try {
      const existing = JSON.parse(
        await fs.promises.readFile(configFilePath, 'utf8')
      );
      return existing;
    } catch {
      // fall through
    }
  }

  const topology = getRedisTopology(redisRunConfig);
  const names = [
    ...topology.nodes.map(n => n.name),
    ...(topology.mode === 'sentinel'
      ? topology.sentinels.map(s => s.name)
      : []),
  ];

  const san = uniq(['localhost', '127.0.0.1', '::1', ...names]);

  const certConfig: CertConfig = {
    outDir: certOutDir,
    days: caConfig.days,
    subject: {
      ...caConfig.subject,
      CN: names[0] ?? 'localhost',
    },
    san,
    files: {
      key: 'server.key.pem',
      cert: 'server.crt.pem',
      csr: 'server.csr.pem',
      fullchain: 'server.fullchain.pem',
      crtAndKey: 'server.crt.key.pem',
    },
    ca: {
      dir: caConfig.outDir,
      passphrase: caConfig.passphrase,
    },
  };

  await ensureFile(configFilePath);
  await fs.promises.writeFile(
    configFilePath,
    JSON.stringify(certConfig, null, 2)
  );
  return certConfig;
}

export async function generateRedisCertConfigsMain(params: {
  redisRunConfig: RedisRunConfig;
  overwrite?: boolean;
}) {
  const {redisRunConfig, overwrite} = params;
  const caConfig = await generateCAConfigForRedis({redisRunConfig, overwrite});
  await generateCertConfigForRedis({redisRunConfig, caConfig, overwrite});
}
