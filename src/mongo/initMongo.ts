import {writeMongoUsersFromConfig} from '../index.js';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {checkMongoReplicaSetReady} from './checkMongoReadyState.js';
import {downloadMongo} from './downloadMongo.js';
import {generateMongoCertConfigsMain} from './generateMongoCertConfigs.js';
import {generateMongoCertsMain} from './generateMongoCerts.js';
import {generateMongodConfigsMain} from './generateMongodConfigs.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {setupFirstUsers, setupReplicaSetMain} from './setupReplicaSet.js';
import {startMongodInstancesMain} from './startMongodInstances.js';
import {stopMongodInstancesMain} from './stopMongodInstances.js';

export async function initMongo(params: {
  mongoRunConfig: MongoRunConfig;
  overwriteConfig?: boolean;
  overwriteCerts?: boolean;
  logger: IForeLogger;
}) {
  const {
    mongoRunConfig,
    overwriteCerts,
    overwriteConfig = overwriteCerts,
    logger = new ConsoleForeLogger({silent: true}),
  } = params;

  logger.log('Downloading mongo');
  await downloadMongo({mongoRunConfig, logger});

  logger.log('Generating mongo cert configs');
  await generateMongoCertConfigsMain({
    mongoRunConfig,
    overwrite: overwriteCerts,
  });

  logger.log('Generating mongo certs');
  await generateMongoCertsMain({
    logger,
    overwriteConfig: overwriteConfig,
    overwriteCA: overwriteCerts,
    overwriteCerts: overwriteCerts,
    mongoRunConfig,
  });

  logger.log('Generating mongo configs without authorization');
  await generateMongodConfigsMain({
    mongoRunConfig,
    overwrite: overwriteConfig,
    modifyConfig: config => {
      // Disable authorization before setting up first users. We'll enable it
      // again later after setting up first users. The reason we do this is is
      // because replica set members with non-local hostnames disables local
      // authentication bypass causing authentication errors.
      config.security.authorization = 'disabled';
      config.security.transitionToAuth = true;
      return config;
    },
  });

  logger.log('Stopping existing mongo instances');
  await stopMongodInstancesMain({mongoRunConfig, logger});

  logger.log('Starting mongo instances');
  await startMongodInstancesMain({
    mongoRunConfig,
    logger,
    waitUntilListening: true,
  });

  logger.log('Writing mongo users');
  await writeMongoUsersFromConfig({
    mongoRunConfig,
    createAdmin: true,
    createClusterAdmin: true,
    logger,
  });

  logger.log('Setting up replica set');
  await setupReplicaSetMain({mongoRunConfig, logger});

  logger.log('Waiting for replica set to be ready');
  await checkMongoReplicaSetReady({mongoRunConfig});

  logger.log('Setting up replica set first users');
  await setupFirstUsers({mongoRunConfig, logger});

  logger.log('Stopping existing mongo instances');
  await stopMongodInstancesMain({mongoRunConfig, logger});

  logger.log('Generating mongo configs with authorization enabled');
  await generateMongodConfigsMain({
    mongoRunConfig,
    overwrite: true,
    modifyConfig: config => {
      config.security.authorization = 'enabled';
      config.security.transitionToAuth = false;
      return config;
    },
  });

  logger.log('Starting mongo instances');
  await startMongodInstancesMain({
    mongoRunConfig,
    logger,
    waitUntilReplicaSetReady: true,
    waitUntilListening: true,
  });
}
