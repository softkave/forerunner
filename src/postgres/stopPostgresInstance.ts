import {execFileSync} from 'child_process';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {PostgresRunConfig} from './postgresRunConfig.js';
import {containerExists, isContainerRunning, volumeExists} from './utils.js';

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

  if (!containerExists(containerName)) {
    logger.log(`Container ${containerName} does not exist`);
    return;
  }

  if (isContainerRunning(containerName)) {
    logger.log(`Stopping container ${containerName}...`);
    const stopOpts = force ? ['kill', containerName] : ['stop', containerName];
    try {
      execFileSync('docker', stopOpts, {stdio: 'pipe', encoding: 'utf8'});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to stop Docker container ${containerName}: ${msg}`
      );
    }
  }

  logger.log(`Removing container ${containerName}...`);
  try {
    execFileSync('docker', ['rm', containerName], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
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

    if (volumeExists(volumeName)) {
      logger.log(`Removing volume ${volumeName}...`);
      try {
        execFileSync('docker', ['volume', 'rm', volumeName], {
          stdio: 'pipe',
          encoding: 'utf8',
        });
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
