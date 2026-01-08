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

  logger.log('Downloading Mongo');
  await downloadMongo({mongoRunConfig, logger});

  logger.log('Generating Mongo cert configs');
  await generateMongoCertConfigsMain({
    mongoRunConfig,
    overwrite: overwriteCerts,
  });

  logger.log('Generating Mongo certs');
  await generateMongoCertsMain({
    logger,
    overwriteConfig: overwriteConfig,
    overwriteCA: overwriteCerts,
    overwriteCerts: overwriteCerts,
    mongoRunConfig,
  });

  logger.log('Generating Mongo configs without authorization');
  await generateMongodConfigsMain({
    mongoRunConfig,
    overwrite: overwriteConfig,
    modifyConfig: config => {
      // Disable authorization before setting up first users. It'll be
      // re-enabled after setting up first users. The reason is to avoid
      // authentication errors when replica set members have non-local hostnames
      // and local authentication bypass is disabled.
      config.security.authorization = 'disabled';
      config.security.transitionToAuth = true;
      return config;
    },
  });

  logger.log('Stopping existing Mongo instances');
  await stopMongodInstancesMain({mongoRunConfig, logger});

  logger.log('Starting Mongo instances');
  await startMongodInstancesMain({
    mongoRunConfig,
    logger,
    waitUntilListening: true,
  });

  logger.log('Writing Mongo users');
  await writeMongoUsersFromConfig({
    mongoRunConfig,
    createAdmin: true,
    createClusterAdmin: true,
    logger,
  });

  logger.log('Setting up Replica Set');
  await setupReplicaSetMain({mongoRunConfig, logger});

  logger.log('Waiting for Replica Set to be ready');
  await checkMongoReplicaSetReady({mongoRunConfig, logger});

  logger.log('Setting up Replica Set first users');
  await setupFirstUsers({mongoRunConfig, logger});

  logger.log('Stopping existing Mongo instances');
  await stopMongodInstancesMain({mongoRunConfig, logger});

  logger.log('Generating Mongo configs with authorization enabled');
  await generateMongodConfigsMain({
    mongoRunConfig,
    overwrite: true,
    modifyConfig: config => {
      config.security.authorization = 'enabled';
      config.security.transitionToAuth = false;
      return config;
    },
  });

  logger.log('Starting Mongo instances');
  await startMongodInstancesMain({
    mongoRunConfig,
    logger,
    waitUntilReplicaSetReady: true,
    waitUntilListening: true,
  });
}
