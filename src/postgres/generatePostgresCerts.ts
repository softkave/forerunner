import {generateCA} from '../certs/caGenerator.js';
import {generateCert} from '../certs/certGenerator.js';
import {ConsoleForeLogger} from '../utils/exports.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {resolveWorkingDir} from '../utils/resolvePathUnderWorkingDir.js';
import {
  generatePostgresCertConfigsMain,
  getPostgresCertCAConfigFilePath,
  getPostgresCertConfigFilePath,
} from './generatePostgresCertConfigs.js';
import {PostgresRunConfig} from './postgresRunConfig.js';

export async function generatePostgresCertsMain(params: {
  overwriteConfig?: boolean;
  overwriteCA?: boolean;
  overwriteCerts?: boolean;
  postgresRunConfig: PostgresRunConfig;
  logger?: IForeLogger;
}) {
  const {
    overwriteConfig,
    overwriteCA,
    postgresRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
  } = params;

  await generatePostgresCertConfigsMain({
    postgresRunConfig,
    overwrite: overwriteConfig,
  });

  const caConfig = getPostgresCertCAConfigFilePath(postgresRunConfig);
  await generateCA({
    opts: {
      config: caConfig,
      cwd: resolveWorkingDir(postgresRunConfig.workingDir),
      force: overwriteCA,
    },
    logger,
  });

  const overwriteCerts = params.overwriteCerts || overwriteCA;
  const certConfig = getPostgresCertConfigFilePath(postgresRunConfig);
  await generateCert({
    opts: {
      config: certConfig,
      cwd: resolveWorkingDir(postgresRunConfig.workingDir),
      force: overwriteCerts,
    },
    logger,
  });
}
