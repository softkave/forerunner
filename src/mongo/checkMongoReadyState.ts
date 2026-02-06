import {range} from 'lodash-es';
import pRetry from 'p-retry';
import {OmitFrom, waitTimeout} from 'softkave-js-utils';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {
  getMongoClientForInstance,
  GetMongoClientForInstanceParams,
  getMongoClientForReplicaSet,
  GetMongoClientForReplicaSetParams,
} from './connection.js';
import {getInstanceRunName} from './constants.js';
import {getReplMemberByInstanceNumber} from './replSetUtils.js';

export async function checkMongoInstanceListening(
  params: {
    retries?: number;
  } & GetMongoClientForInstanceParams
) {
  const {
    instanceNumber,
    logger = new ConsoleForeLogger({silent: true}),
    retries = 5,
  } = params;

  try {
    await pRetry(
      async () => {
        const client = await getMongoClientForInstance(params);
        await client.close();
      },
      {
        retries,
        onFailedAttempt: error => {
          logger.log(
            `Failed to connect to MongoDB instance ${instanceNumber}, attempt ${error.attemptNumber}/${error.retriesLeft + error.attemptNumber}`
          );
          logger.error(error);
        },
      }
    );
    return true;
  } catch (error) {
    logger.log(
      `Failed to connect to MongoDB instance ${instanceNumber} after retries`
    );
    logger.error(error);
    return false;
  }
}

export async function assertMongoInstanceListening(
  params: {
    retries?: number;
  } & GetMongoClientForInstanceParams
): Promise<void> {
  const result = await checkMongoInstanceListening(params);
  if (!result) {
    throw new Error(
      `Failed to connect to MongoDB instance ${params.instanceNumber} after retries`
    );
  }
}

export async function checkMongoInstancesListening(
  params: {
    retries?: number;
  } & OmitFrom<GetMongoClientForInstanceParams, 'instanceNumber'>
) {
  const {mongoRunConfig} = params;

  const instanceNumbers = range(mongoRunConfig.instancePorts.length);
  const results = await Promise.all(
    instanceNumbers.map(instanceNumber =>
      checkMongoInstanceListening({
        ...params,
        instanceNumber: instanceNumber + 1,
      })
    )
  );
  return results.every(result => result);
}

export async function assertMongoInstancesListening(
  params: {
    retries?: number;
  } & OmitFrom<GetMongoClientForInstanceParams, 'instanceNumber'>
): Promise<void> {
  const result = await checkMongoInstancesListening(params);
  if (!result) {
    throw new Error(`Failed to connect to MongoDB instances after retries`);
  }
}

export async function checkMongoReplicaSetReady(
  params: {
    retries?: number;
  } & GetMongoClientForReplicaSetParams
) {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    retries = 5,
  } = params;

  try {
    await pRetry(
      async () => {
        const client = await getMongoClientForReplicaSet(params);
        logger.log('Replica set ready');
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
        retries,
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

export async function assertMongoReplicaSetReady(
  params: {
    retries?: number;
  } & GetMongoClientForReplicaSetParams
): Promise<void> {
  const result = await checkMongoReplicaSetReady(params);
  if (!result) {
    throw new Error(
      `Failed to connect to MongoDB replica set ${params.mongoRunConfig.replicaSetName} after retries`
    );
  }
}

/**
 * Wait for member to reach PRIMARY or SECONDARY state.
 * Polls replica set status at specified intervals until timeout.
 * Throws error if timeout is reached before member reaches target state.
 */
export async function waitForMemberState(
  params: {
    instanceNumber: number;
    timeoutMs?: number;
    pollIntervalMs?: number;
  } & GetMongoClientForInstanceParams
): Promise<void> {
  const {
    instanceNumber,
    mongoRunConfig,
    logger,
    timeoutMs = 120000, // 2 minutes default
    pollIntervalMs = 10_000, // 10 seconds default
  } = params;

  const startTime = Date.now();
  const instanceRunName = getInstanceRunName(instanceNumber);

  while (Date.now() - startTime < timeoutMs) {
    try {
      const member = await getReplMemberByInstanceNumber({
        instanceNumber,
        mongoRunConfig,
        logger,
      });

      if (member) {
        if (member.stateStr === 'PRIMARY' || member.stateStr === 'SECONDARY') {
          // PRIMARY or SECONDARY
          logger.log(
            `Member ${instanceRunName} reached state ${member.stateStr}`
          );
          return;
        }

        logger.log(
          `Member ${instanceRunName} state: ${member.stateStr}, waiting...`
        );
      } else {
        logger.log(
          `Member ${instanceRunName} not found in replica set status, waiting...`
        );
      }
    } catch (error) {
      logger.log(
        `Error checking member state for ${instanceRunName}: ${error}`
      );
    }

    await waitTimeout(pollIntervalMs);
  }

  throw new Error(
    `Timeout waiting for member ${instanceRunName} to reach PRIMARY or SECONDARY state`
  );
}
