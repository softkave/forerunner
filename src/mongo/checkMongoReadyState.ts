import {range} from 'lodash-es';
import pRetry from 'p-retry';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {
  getMongoClientForInstance,
  getMongoClientForReplicaSet,
} from './utils.js';

/**
 * Provides functions to check if Mongo instances are listening and if a Replica
 * Set is ready by attempting to connect to them using p-retry.
 */

export async function checkMongoInstanceListening(params: {
  mongoRunConfig: MongoRunConfig;
  instanceNumber: number;
  logger?: IForeLogger;
}) {
  const {
    mongoRunConfig,
    instanceNumber,
    logger = new ConsoleForeLogger({silent: true}),
  } = params;

  try {
    await pRetry(
      async () => {
        const client = await getMongoClientForInstance({
          mongoRunConfig,
          instanceNumber,
          logger,
          preferLocalhost: true,
        });
        await client.close();
      },
      {
        onFailedAttempt: error => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.log(
            `Failed to connect to MongoDB instance ${instanceNumber}, attempt ${error.attemptNumber}/${error.retriesLeft + error.attemptNumber}: ${errorMessage}`
          );
        },
      }
    );
    return true;
  } catch (error) {
    logger.log(
      `Failed to connect to MongoDB instance ${instanceNumber} after retries: ${error}`
    );
    return false;
  }
}

export async function checkMongoInstancesListening(params: {
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
}) {
  const {mongoRunConfig, logger} = params;
  const instanceNumbers = range(mongoRunConfig.instancePorts.length);
  const results = await Promise.all(
    instanceNumbers.map(instanceNumber =>
      checkMongoInstanceListening({
        mongoRunConfig,
        instanceNumber: instanceNumber + 1,
        logger,
      })
    )
  );
  return results.every(result => result);
}

export async function checkMongoReplicaSetReady(params: {
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
}) {
  const {mongoRunConfig, logger = new ConsoleForeLogger({silent: true})} =
    params;

  try {
    await pRetry(
      async () => {
        const client = await getMongoClientForReplicaSet({
          mongoRunConfig,
          logger,
          preferLocalhost: true,
        });
        await client.close();
      },
      {
        onFailedAttempt: error => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.log(
            `Failed to connect to MongoDB replica set ${mongoRunConfig.replicaSetName}, attempt ${error.attemptNumber}/${error.retriesLeft + error.attemptNumber}: ${errorMessage}`
          );
        },
      }
    );
    return true;
  } catch (error) {
    logger.log(
      `Failed to connect to MongoDB replica set ${mongoRunConfig.replicaSetName} after retries: ${error}`
    );
    return false;
  }
}
