import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {PostgresRunConfig} from './postgresRunConfig.js';
import {containerExists, isContainerRunning, volumeExists} from './utils.js';
import {spawnInherit} from '../utils/spawnInherit.js';

export async function stopPostgresInstance(params: {
  containerName: string;
  postgresRunConfig?: PostgresRunConfig;
  logger?: IForeLogger;
  force?: boolean;
  removeVolume?: boolean;
}) {
  const {
    containerName,
    postgresRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    force = false,
    removeVolume = false,
  } = params;

  if (!(await containerExists(containerName))) {
    logger.log(`Container ${containerName} does not exist`);
    return;
  }

  if (await isContainerRunning(containerName)) {
    logger.log(`Stopping container ${containerName}...`);
    const stopOpts = force ? ['kill', containerName] : ['stop', containerName];
    try {
      await spawnInherit('docker', stopOpts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to stop Docker container ${containerName}: ${msg}`
      );
    }
  }

  logger.log(`Removing container ${containerName}...`);
  try {
    await spawnInherit('docker', ['rm', containerName]);
    logger.log(`Removed container ${containerName}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.log(
      `Could not remove container ${containerName} (may already be removed): ${msg}`
    );
  }

  // Handle volume removal
  const shouldRemoveVolume =
    removeVolume ||
    (postgresRunConfig !== undefined && !postgresRunConfig.keep);

  if (shouldRemoveVolume) {
    const volumeName =
      postgresRunConfig?.volumeName ??
      postgresRunConfig?.containerName ??
      containerName;

    if (await volumeExists(volumeName)) {
      logger.log(`Removing volume ${volumeName}...`);
      try {
        await spawnInherit('docker', ['volume', 'rm', volumeName]);
        logger.log(`Removed volume ${volumeName}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.log(
          `Could not remove volume ${volumeName} (may be in use): ${msg}`
        );
      }
    }
  }
}
