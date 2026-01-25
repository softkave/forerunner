import {pathExists} from 'fs-extra';
import pRetry, {AbortError} from 'p-retry';
import {endPIDs} from '../pid/endPIDs.js';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {checkInstanceConnectable, closeMongoClient} from './connection.js';
import {getInstancePaths} from './constants.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {findClusterAdminUser} from './user/findUtils.js';
import {
  getMongoClientForInstance,
  getMongodConfigForInstance,
} from './utils.js';

async function verifyInstanceIsDown(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  verifyRetries?: number;
  instanceRunName: string;
}): Promise<void> {
  const {
    instanceNumber,
    mongoRunConfig,
    logger,
    instanceRunName,
    verifyRetries = 3,
  } = params;

  try {
    await pRetry(
      async () => {
        const isConnectable = await checkInstanceConnectable({
          instanceNumber,
          mongoRunConfig,
          logger,
        });

        if (isConnectable) {
          throw new Error('Instance is still connectable');
        }
      },
      {
        retries: verifyRetries,
        onFailedAttempt: ({attemptNumber}) => {
          logger.log(
            `Instance ${instanceRunName} still connectable, attempt ${attemptNumber}/${verifyRetries}`
          );
        },
      }
    );

    logger.log(`Instance ${instanceRunName} successfully shut down`);
    return;
  } catch (error) {
    logger.log(
      `Instance ${instanceRunName} still connectable after ${verifyRetries} verification attempts`
    );

    throw error;
  }
}

export async function stopMongodInstanceWithShutdown(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  force?: boolean;
  shutdownRetries?: number;
  verifyRetries?: number;
  shutdownTimeoutMs?: number;
}) {
  const {
    instanceNumber,
    mongoRunConfig,
    shutdownTimeoutMs,
    logger = new ConsoleForeLogger({silent: true}),
    force = false,
    shutdownRetries = 3,
    verifyRetries = 3,
  } = params;

  const instanceRunName = `mongod-${instanceNumber}`;
  logger.log(`Attempting graceful shutdown of ${instanceRunName}`);

  const clusterAdminUser = await findClusterAdminUser({
    users: mongoRunConfig.users,
    isRequired: mongoRunConfig.authorization !== 'disabled',
  });

  // Retry shutdown command
  let shutdownSucceeded = false;
  try {
    await pRetry(
      async () => {
        const client = await getMongoClientForInstance({
          mongoRunConfig,
          instanceNumber,
          logger,
          preferLocalhost: true,
          username: clusterAdminUser?.username,
          password: clusterAdminUser?.password,
        });

        try {
          const adminDb = client.db('admin');
          const result = await adminDb.command({
            shutdown: 1,
            force,
            timeoutSecs: shutdownTimeoutMs
              ? Math.floor(shutdownTimeoutMs / 1000)
              : undefined,
          });
          console.log('result', {result});
          logger.log(`Shutdown command sent to ${instanceRunName}`);
        } catch (error) {
          // Shutdown command closes the connection, so connection errors are expected
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (
            errorMessage.includes('connection') &&
            errorMessage.includes('closed')
          ) {
            logger.log(
              `Shutdown command succeeded (connection closed as expected)`
            );
            shutdownSucceeded = true;
            return;
          }

          throw error;
        } finally {
          await closeMongoClient(client);
        }
      },
      {
        retries: shutdownRetries,
        onFailedAttempt: ({error}) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          // Check if error contains ECONNREFUSED twice (IPv4 and IPv6 connection attempts)
          const econnrefusedCount = (errorMessage.match(/ECONNREFUSED/gi) || [])
            .length;

          if (econnrefusedCount >= 2) {
            logger.log(
              `Server ${instanceRunName} is not online (ECONNREFUSED detected). Stopping shutdown attempts.`
            );
            throw new AbortError(`Server ${instanceRunName} is not online`);
          }

          logger.log(
            `Shutdown command attempt failed for ${instanceRunName}: ${errorMessage}`
          );
          logger.error(error);
        },
      }
    );

    shutdownSucceeded = true;
  } catch (error) {
    logger.log(
      `Shutdown command failed after ${shutdownRetries} retries for ${instanceRunName}`
    );
    logger.error(error);
  }

  // Verify instance is down by attempting to connect
  if (shutdownSucceeded) {
    await verifyInstanceIsDown({
      instanceNumber,
      mongoRunConfig,
      logger,
      instanceRunName,
      verifyRetries,
    });
  } else {
    throw new Error(
      `Shutdown command failed after ${shutdownRetries} retries for ${instanceRunName}`
    );
  }
}

export async function stopMongodInstanceWithProcessKill(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}) {
  const {instanceNumber, mongoRunConfig, logger} = params;

  const {instanceRunDir, instancePidFilepath, instanceRunName} =
    getInstancePaths({instanceNumber, mongoRunConfig});

  const pidFileExists = await pathExists(instancePidFilepath);
  if (!pidFileExists) {
    logger.log(`PID file does not exist for ${instanceRunName}`);
    return;
  }

  const config = await getMongodConfigForInstance({
    instanceNumber,
    mongoRunConfig,
  });
  await endPIDs({
    pidsFilepath: instancePidFilepath,
    cwd: instanceRunDir,
    ports: [config.net.port],
  });
  logger.log(`Process kill completed for ${instanceRunName}`);
}

export async function stopMongodInstance(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  force?: boolean;
  fallbackToKill?: boolean;
  shutdownRetries?: number;
  verifyRetries?: number;
  shutdownTimeoutMs?: number;
}) {
  const {
    instanceNumber,
    mongoRunConfig,
    shutdownTimeoutMs,
    shutdownRetries,
    verifyRetries,
    logger = new ConsoleForeLogger({silent: true}),
    force = false,
    fallbackToKill = false,
  } = params;
  const instanceRunName = `mongod-${instanceNumber}`;

  try {
    // Try graceful shutdown first
    await stopMongodInstanceWithShutdown({
      instanceNumber,
      mongoRunConfig,
      logger,
      force,
      shutdownRetries,
      verifyRetries,
      shutdownTimeoutMs,
    });
  } catch (error) {
    if (!fallbackToKill) {
      throw error;
    }

    // Fallback to process kill
    logger.log(`Using process kill fallback for ${instanceRunName}`);
    await stopMongodInstanceWithProcessKill({
      instanceNumber,
      mongoRunConfig,
      logger,
    });
  }
}

export async function stopMongodInstancesMain(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  force?: boolean;
  fallbackToKill?: boolean;
  shutdownRetries?: number;
  verifyRetries?: number;
  shutdownTimeoutMs?: number;
}) {
  const {
    mongoRunConfig,
    shutdownRetries,
    verifyRetries,
    shutdownTimeoutMs,
    logger = new ConsoleForeLogger({silent: true}),
    force = false,
    fallbackToKill = false,
  } = params;

  const results = await Promise.allSettled(
    Array.from({length: mongoRunConfig.instancePorts.length}, async (_, i) => {
      await stopMongodInstance({
        instanceNumber: i + 1,
        mongoRunConfig,
        logger,
        force,
        fallbackToKill,
        shutdownRetries,
        verifyRetries,
        shutdownTimeoutMs,
      });
    })
  );

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      logger.log(`mongod-${index + 1} stopped successfully`);
    } else {
      const errorMessage =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      logger.log(`mongod-${index + 1} failed to stop: ${errorMessage}`);
    }
  });
}
