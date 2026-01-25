import {ConsoleForeLogger, IForeLogger} from '../../utils/exports.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {restartReplicaSetMembersRolling} from './restartReplSet.js';

/**
 * Restart function that performs rolling restart of replica set members.
 * Does not download new versions or manage users - only restarts existing instances.
 * Useful for applying configuration changes or recovering from issues.
 */
export async function restartMongo(params: {
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

  logger.log('Starting MongoDB restart process');

  await restartReplicaSetMembersRolling({
    mongoRunConfig,
    logger,
    force,
    fallbackToKill,
    stepDownSeconds,
    secondaryCatchUpPeriodSecs,
  });

  logger.log('MongoDB restart completed successfully');
}
