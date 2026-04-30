import fs from 'fs';
import {ensureDir} from 'fs-extra';
import {generateCA} from '../certs/caGenerator.js';
import {generateCert} from '../certs/certGenerator.js';
import {CAConfigSchema, CertConfigSchema} from '../certs/types.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {
  generateRedisCertConfigsMain,
  getRedisCertCAConfigFilePath,
  getRedisCertConfigFilePath,
} from './generateRedisCertConfigs.js';
import {getRedisCertOutDir} from './paths.js';
import {RedisRunConfig} from './redisRunConfig.js';

export async function generateRedisCertsMain(params: {
  redisRunConfig: RedisRunConfig;
  overwriteConfig?: boolean;
  overwriteCA?: boolean;
  overwriteCerts?: boolean;
  logger: IForeLogger;
}) {
  const {
    redisRunConfig,
    overwriteConfig = false,
    overwriteCA = false,
    overwriteCerts: overwriteCertsParam = false,
    logger,
  } = params;

  // Config generation
  await generateRedisCertConfigsMain({
    redisRunConfig,
    overwrite: overwriteConfig,
  });

  const caConfigPath = getRedisCertCAConfigFilePath({redisRunConfig});
  const certConfigPath = getRedisCertConfigFilePath({redisRunConfig});

  // Ensure output directory exists
  await ensureDir(getRedisCertOutDir(redisRunConfig));

  // Validate config files
  CAConfigSchema.parse(
    JSON.parse(await fs.promises.readFile(caConfigPath, 'utf8'))
  );
  CertConfigSchema.parse(
    JSON.parse(await fs.promises.readFile(certConfigPath, 'utf8'))
  );

  await generateCA({
    opts: {config: caConfigPath, force: overwriteCA},
    logger,
  });

  const overwriteCerts = overwriteCertsParam || overwriteCA;
  await generateCert({
    opts: {config: certConfigPath, force: overwriteCerts},
    logger,
  });
}
