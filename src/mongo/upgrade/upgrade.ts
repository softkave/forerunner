import {ConsoleForeLogger, IForeLogger} from '../../utils/exports.js';
import {downloadMongo} from '../downloadMongo.js';
import {
  MongoRunConfig,
  cacheMongoRunConfig,
  getCachedMongoRunConfig,
} from '../mongoRunConfig.js';
import {restartReplicaSetMembersRolling} from '../restart/restartReplSet.js';
import {
  applyUserChanges,
  getUserChanges,
  hasUserChanges,
} from '../user/applyUserChanges.js';

/**
 * Check if version change is detected in mongoVersion, systemLinux, or os fields.
 * Returns true if any of these fields differ between configs.
 */
export function hasVersionChange(params: {
  cachedConfig: MongoRunConfig;
  currentConfig: MongoRunConfig;
}): boolean {
  const {cachedConfig, currentConfig} = params;
  return (
    cachedConfig.mongoVersion !== currentConfig.mongoVersion ||
    cachedConfig.systemLinux !== currentConfig.systemLinux ||
    cachedConfig.os !== currentConfig.os
  );
}

/**
 * Main upgrade function that orchestrates version upgrades and user management.
 * Detects changes between cached and current configs, downloads new versions if needed,
 * performs rolling restarts, and applies user changes.
 * Caches the new config after successful upgrade.
 */
export async function upgradeMongo(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  force?: boolean;
  fallbackToKill?: boolean;
  stepDownSeconds?: number;
  secondaryCatchUpPeriodSecs?: number;
}): Promise<void> {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    force = false,
    fallbackToKill = false,
    stepDownSeconds = 120,
    secondaryCatchUpPeriodSecs,
  } = params;

  logger.log('Starting MongoDB upgrade process');

  // Load cached config
  let cachedConfig: MongoRunConfig | undefined;
  try {
    cachedConfig = await getCachedMongoRunConfig({mongoRunConfig});
    logger.log('Loaded cached Mongo run config');
  } catch (error) {
    logger.log('No cached config found, treating as initial setup');
  }

  // Diff configs
  const hasVersionChange_ = cachedConfig
    ? hasVersionChange({cachedConfig, currentConfig: mongoRunConfig})
    : false;
  const hasUserChanges_ = cachedConfig
    ? hasUserChanges({cachedConfig, currentConfig: mongoRunConfig})
    : false;

  logger.log(`Version change detected: ${hasVersionChange_}`);
  logger.log(`User changes detected: ${hasUserChanges_}`);

  // Handle version change
  if (hasVersionChange_) {
    logger.log('Downloading new Mongo version...');
    await downloadMongo({mongoRunConfig, logger});

    logger.log('Restarting replica set members with new version...');
    await restartReplicaSetMembersRolling({
      mongoRunConfig,
      logger,
      force,
      fallbackToKill,
      stepDownSeconds,
      secondaryCatchUpPeriodSecs,
    });
  }

  // Handle user changes
  if (hasUserChanges_) {
    logger.log('Applying user changes...');
    const userChanges = cachedConfig
      ? getUserChanges({cachedConfig, currentConfig: mongoRunConfig})
      : {
          added: [],
          removed: [],
          updated: [],
        };

    if (
      userChanges.added.length > 0 ||
      userChanges.removed.length > 0 ||
      userChanges.updated.length > 0
    ) {
      await applyUserChanges({
        userChanges,
        mongoRunConfig,
        logger,
      });
    }
  }

  // Cache the new config
  await cacheMongoRunConfig({mongoRunConfig});
  logger.log('Cached new Mongo run config');

  logger.log('MongoDB upgrade completed successfully');
}
