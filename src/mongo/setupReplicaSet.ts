import {MongoClient} from 'mongodb';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {
  filterRegularMongoUsers,
  findAdminMongoUser,
  findClusterAdminMongoUser,
  getMongoUsersConfigFilePath,
  readMongoUsers,
  setupSingleMongoUser,
} from './setupMongoUsers.js';
import {
  getFirstNonLocalhostBindIp,
  getMongoClientForInstance,
  getMongodConfigs,
} from './utils.js';

export async function setupReplicaSetFirstUsers(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}) {
  const {mongoRunConfig, logger = new ConsoleForeLogger({silent: true})} =
    params;
  const mongoUsers = await readMongoUsers({
    configFilePath: getMongoUsersConfigFilePath(mongoRunConfig),
  });
  const adminUser = await findAdminMongoUser({
    mongoUsers,
    createIfNotFound: true,
  });
  if (!adminUser) {
    logger.log('Admin user not found, skipping');
    return;
  }

  await setupSingleMongoUser({user: adminUser, mongoRunConfig, logger});

  const clusterAdminUser = await findClusterAdminMongoUser({
    mongoUsers,
    createIfNotFound: true,
  });
  if (!clusterAdminUser) {
    logger.log('Cluster admin user not found, skipping');
    return;
  }

  await setupSingleMongoUser({
    user: clusterAdminUser,
    adminUser,
    mongoRunConfig,
    logger,
  });

  const regularUsers = await filterRegularMongoUsers({mongoUsers});
  await Promise.all(
    regularUsers.map(user =>
      setupSingleMongoUser({user, adminUser, mongoRunConfig, logger})
    )
  );
}

export async function setupReplicaSetMain(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}) {
  const {mongoRunConfig, logger = new ConsoleForeLogger({silent: true})} =
    params;
  const replicaCount = mongoRunConfig.replicaCount;
  const mongodConfigs = await getMongodConfigs({replicaCount, mongoRunConfig});
  const mongoConfig0 = mongodConfigs[0];

  let client: MongoClient | null = null;

  try {
    client = await getMongoClientForInstance({mongoRunConfig, logger});
    const adminDb = client.db('admin');

    // Check if replica set is already initialized
    try {
      const rsStatus = await adminDb.command({replSetGetStatus: 1});
      logger.log('Replica set already initialized, status:', rsStatus);
    } catch (error) {
      if ((error as any).code === 23) {
        // AlreadyInitialized
        logger.log('Replica set already initialized');
      } else {
        // Try to initialize the replica set
        logger.log('Initializing replica set...');
        const result = await adminDb.command({
          replSetInitiate: {
            _id: mongoConfig0.replication.replSetName,
            members: mongodConfigs.map((config, index) => {
              const bindIp0 = getFirstNonLocalhostBindIp({
                bindIp: config.net.bindIp,
              });
              let host = `${bindIp0}:${config.net.port}`;
              logger.log('host:', host);
              return {
                _id: index,
                host: host,
              };
            }),
          },
        });
        logger.log('Replica set initialization result:', result);
      }
    }
  } finally {
    // Close the database connection on completion or error
    await client?.close();
  }
}
