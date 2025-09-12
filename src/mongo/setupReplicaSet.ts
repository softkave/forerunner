import assert from 'assert';
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
  separateBindIps,
} from './utils.js';

export async function setupFirstUsers(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  client?: MongoClient;
  /** Only used if a client is provided */
  connectionType?: 'replicaSet' | 'instance';
}) {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    client,
    connectionType = 'replicaSet',
  } = params;

  const mongoUsers = await readMongoUsers({
    configFilePath: getMongoUsersConfigFilePath(mongoRunConfig),
  });
  const adminUser = await findAdminMongoUser({
    mongoUsers,
    createIfNotFound: true,
  });

  // If a client is provided, we don't want to close it after setting up a user
  // because it's externally managed.
  const retainClient = !!client;

  if (adminUser) {
    logger.log('Admin user found, setting up');
    await setupSingleMongoUser({
      user: adminUser,
      mongoRunConfig,
      logger,
      preferLocalhost: true,
      client,
      retainClient,
      connectionType,
    });
  }

  const clusterAdminUser = await findClusterAdminMongoUser({
    mongoUsers,
    createIfNotFound: true,
  });
  if (clusterAdminUser) {
    logger.log('Cluster admin user found, setting up');
    await setupSingleMongoUser({
      user: clusterAdminUser,
      adminUser,
      mongoRunConfig,
      logger,
      preferLocalhost: true,
      client,
      retainClient,
      connectionType,
    });
  }

  const regularUsers = await filterRegularMongoUsers({mongoUsers});
  if (regularUsers.length > 0) {
    logger.log('Setting up regular users', regularUsers.length);
    await Promise.all(
      regularUsers.map(user =>
        setupSingleMongoUser({
          user,
          adminUser,
          mongoRunConfig,
          logger,
          preferLocalhost: true,
          client,
          retainClient,
          connectionType,
        })
      )
    );
  }
}

export async function setupReplicaSetMain(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  retainClient?: boolean;
}) {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    retainClient,
  } = params;
  const replicaCount = mongoRunConfig.replicaCount;
  const mongodConfigs = await getMongodConfigs({replicaCount, mongoRunConfig});
  const mongoConfig0 = mongodConfigs[0];

  let client: MongoClient | null = null;

  try {
    client = await getMongoClientForInstance({
      mongoRunConfig,
      logger,
      preferLocalhost: true,
    });
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
              const hostnames = separateBindIps(config.net.bindIp);
              const bindIp0 =
                getFirstNonLocalhostBindIp({hostnames}) || hostnames[0];
              assert.ok(bindIp0, 'bindIp0 must be set');
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

    return retainClient ? client : undefined;
  } finally {
    // Close the database connection on completion or error
    if (!retainClient) {
      await client?.close();
    }
  }
}
