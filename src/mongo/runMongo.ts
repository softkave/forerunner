import {compact, uniqBy} from 'lodash-es';
import {writeMongoUser} from '../index.js';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {
  checkMongoInstancesListening,
  checkMongoReplicaSetReady,
} from './checkMongoReadyState.js';
import {downloadMongo} from './downloadMongo.js';
import {setNonLocalhostNamesInEtcHostsMain} from './etcHostsMongo.js';
import {generateMongoCertConfigsMain} from './generateMongoCertConfigs.js';
import {generateMongoCertsMain} from './generateMongoCerts.js';
import {generateMongodConfigsMain} from './generateMongodConfigs.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {
  findAdminMongoUser,
  findClusterAdminMongoUser,
  getMongoUsersConfigFilePath,
  readMongoUsers,
} from './setupMongoUsers.js';
import {
  setupReplicaSetFirstUsers,
  setupReplicaSetMain,
} from './setupReplicaSet.js';
import {startMongodInstancesMain} from './startMongodInstances.js';
import {stopMongodInstancesMain} from './stopMongodInstances.js';

export async function runMongo(params: {
  mongoRunConfig: MongoRunConfig;
  overwriteConfig?: boolean;
  overwriteCerts?: boolean;
  addToEtcHosts?: boolean;
  logger: IForeLogger;
}) {
  const {
    mongoRunConfig,
    overwriteCerts,
    overwriteConfig = overwriteCerts,
    addToEtcHosts,
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

  logger.log('Generating mongo configs');
  await generateMongodConfigsMain({mongoRunConfig, overwrite: overwriteConfig});

  if (addToEtcHosts) {
    logger.log('Setting non localhost names in etc hosts');
    await setNonLocalhostNamesInEtcHostsMain({mongoRunConfig, logger});
  }

  logger.log('Stopping existing mongo instances');
  await stopMongodInstancesMain({mongoRunConfig, logger});

  logger.log('Starting mongo instances');
  await startMongodInstancesMain({mongoRunConfig, logger});

  logger.log('Waiting for mongo instances to start');
  await checkMongoInstancesListening({mongoRunConfig});

  logger.log('Reading mongo users');
  const mongoUsers = await readMongoUsers({
    configFilePath: getMongoUsersConfigFilePath(mongoRunConfig),
  });

  logger.log('Finding admin user');
  const adminUser = await findAdminMongoUser({
    mongoUsers,
    createIfNotFound: true,
  });

  logger.log('Finding cluster admin user');
  const clusterAdminUser = await findClusterAdminMongoUser({
    mongoUsers,
    createIfNotFound: true,
  });
  const users = uniqBy(
    compact([
      adminUser,
      clusterAdminUser,
      ...mongoUsers,
      ...mongoRunConfig.users,
    ]),
    user => user.username
  );

  logger.log('Writing mongo users');
  await writeMongoUser({mongoRunConfig, users, logger});

  logger.log('Setting up replica set');
  await setupReplicaSetMain({mongoRunConfig, logger});

  logger.log('Waiting for replica set to be ready');
  await checkMongoReplicaSetReady({mongoRunConfig});

  logger.log('Setting up replica set first users if not setup');
  await setupReplicaSetFirstUsers({mongoRunConfig, logger});
}
