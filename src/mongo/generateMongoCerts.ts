import {generateCA} from '../certs/caGenerator.js';
import {generateCert} from '../certs/certGenerator.js';
import {ConsoleForeLogger} from '../utils/exports.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {resolveWorkingDir} from '../utils/resolvePathUnderWorkingDir.js';
import {
  generateMongoCertConfigsMain,
  getMongoCertCAConfigFilePath,
  getMongoCertConfigFilePath,
} from './generateMongoCertConfigs.js';
import {MongoRunConfig} from './mongoRunConfig.js';

/**
 * Ensures MongoDB certificates are generated if not already present.
 * SSL/TLS is always enabled; certificates are always required.
 */
export async function ensureMongoCertificates(params: {
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
}): Promise<void> {
  const {mongoRunConfig, logger = new ConsoleForeLogger({silent: true})} =
    params;
  logger.log('Ensuring MongoDB certificates are present...');
  await generateMongoCertConfigsMain({
    mongoRunConfig,
    overwrite: false,
  });
  await generateMongoCertsMain({
    mongoRunConfig,
    overwriteConfig: false,
    overwriteCA: false,
    overwriteCerts: false,
    logger,
  });
}

export async function generateMongoCertsMain(params: {
  overwriteConfig?: boolean;
  overwriteCA?: boolean;
  overwriteCerts?: boolean;
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
}) {
  const {
    overwriteConfig,
    overwriteCA,
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
  } = params;

  await generateMongoCertConfigsMain({
    mongoRunConfig,
    overwrite: overwriteConfig,
  });

  const caConfig = getMongoCertCAConfigFilePath(mongoRunConfig);
  await generateCA({
    opts: {
      config: caConfig,
      cwd: resolveWorkingDir(mongoRunConfig.workingDir),
      force: overwriteCA,
    },
    logger,
  });

  console.log({
    caConfig,
    wd: mongoRunConfig.workingDir,
    cwd: resolveWorkingDir(mongoRunConfig.workingDir),
  });

  const overwriteCerts = params.overwriteCerts || overwriteCA;
  for (let i = 1; i <= mongoRunConfig.ports.length; i++) {
    const certConfig = getMongoCertConfigFilePath(mongoRunConfig, i);
    console.log({
      certConfig,
      wd: mongoRunConfig.workingDir,
      cwd: resolveWorkingDir(mongoRunConfig.workingDir),
    });
    await generateCert({
      opts: {
        config: certConfig,
        cwd: resolveWorkingDir(mongoRunConfig.workingDir),
        force: overwriteCerts,
      },
      logger,
    });
  }
}
