import {execFile} from 'child_process';
import {containerExists} from '../utils/docker.js';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {getInstanceRunName} from './constants.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {getDockerContainerName} from './startMongo.js';
import {promisify} from 'util';

const execFileAsync = promisify(execFile);

export async function stopMongodInstance(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  force?: boolean;
}) {
  const {
    instanceNumber,
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    force = false,
  } = params;

  const instanceRunName = getInstanceRunName(instanceNumber);
  const containerName = getDockerContainerName(mongoRunConfig, instanceNumber);

  if (!(await containerExists(containerName))) {
    logger.log(
      `Container ${containerName} does not exist for ${instanceRunName}`
    );
    return;
  }

  logger.log(`Stopping ${instanceRunName} (container ${containerName})...`);

  const stopOpts = force ? ['kill', containerName] : ['stop', containerName];
  try {
    await execFileAsync('docker', stopOpts, {encoding: 'utf8'});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to stop Docker container ${containerName}: ${msg}`);
  }

  try {
    await execFileAsync('docker', ['rm', '-v', containerName], {
      encoding: 'utf8',
    });
    logger.log(`Removed container ${containerName}`);
  } catch {
    // Container may already be removed or remove failed; log and continue
    logger.log(
      `Could not remove container ${containerName} (may already be removed)`
    );
  }
}

export async function stopMongoMain(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  force?: boolean;
}) {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    force = false,
  } = params;

  const results = await Promise.allSettled(
    Array.from({length: mongoRunConfig.ports.length}, async (_, i) => {
      await stopMongodInstance({
        instanceNumber: i + 1,
        mongoRunConfig,
        logger,
        force,
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
