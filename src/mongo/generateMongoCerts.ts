import {generateCA} from '../certs/caGenerator.js';
import {generateCert} from '../certs/certGenerator.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {
  generateMongoCertConfigsMain,
  getMongoCertCAConfigFilePath,
  getMongoCertConfigFilePath,
} from './generateMongoCertConfigs.js';
import {MongoRunConfig} from './mongoRunConfig.js';

export async function generateMongoCertsMain(params: {
  overwriteConfig?: boolean;
  overwriteCA?: boolean;
  overwriteCerts?: boolean;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}) {
  const {overwriteConfig, overwriteCA, mongoRunConfig, logger} = params;

  await generateMongoCertConfigsMain({
    mongoRunConfig,
    overwrite: overwriteConfig,
  });

  const caConfig = getMongoCertCAConfigFilePath(mongoRunConfig);
  await generateCA({
    opts: {
      config: caConfig,
      force: overwriteCA,
    },
    logger,
  });

  const overwriteCerts = params.overwriteCerts || overwriteCA;
  const replicaCount = mongoRunConfig.replicaCount;
  for (let i = 1; i <= replicaCount; i++) {
    const certConfig = getMongoCertConfigFilePath(mongoRunConfig, i);
    await generateCert({
      opts: {
        config: certConfig,
        force: overwriteCerts,
      },
      logger,
    });
  }
}
