import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {assertMongoReplicaSetReady} from './checkMongoReadyState.js';
import {downloadMongo} from './downloadMongo.js';
import {generateMongoCertConfigsMain} from './generateMongoCertConfigs.js';
import {generateMongoCertsMain} from './generateMongoCerts.js';
import {generateMongodConfigsMain} from './generateMongodConfigs.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {setupReplicaSetMain} from './setupReplicaSet.js';
import {startMongodInstancesMain} from './startMongodInstances.js';
import {stopMongodInstancesMain} from './stopMongodInstances.js';
import {setupUsers} from './user/setupUsers.js';

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
  });

  logger.log('Stopping existing Mongo instances');
  await stopMongodInstancesMain({mongoRunConfig, logger});

  logger.log('Starting Mongo instances');
  await startMongodInstancesMain({
    mongoRunConfig,
    logger,
    waitUntilListening: true,
  });

  logger.log('Setting up Replica Set');
  await setupReplicaSetMain({mongoRunConfig, logger});

  logger.log('Waiting for Replica Set to be ready');
  await assertMongoReplicaSetReady({mongoRunConfig, logger});

  logger.log('Setting up Replica Set first users');
  await setupUsers({mongoRunConfig, logger});
}
