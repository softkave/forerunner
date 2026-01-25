import assert from 'assert';
import {MongoClient} from 'mongodb';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {
  getFirstNonLocalhostBindIp,
  getMongoClientForInstance,
  getMongodConfigs,
  separateBindIps,
} from './utils.js';

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
  if (!replicaCount) {
    throw new Error('Replica count is not set');
  }

  const mongodConfigs = await getMongodConfigs({replicaCount, mongoRunConfig});
  const mongoConfig0 = mongodConfigs[0];
  let client: MongoClient | null = null;

  if (!mongoConfig0.replication) {
    throw new Error('Replication is not set');
  }

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
        logger.log(
          'Replica set initialization result:',
          result.ok ? 'success' : 'failed'
        );
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
