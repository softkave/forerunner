import {IForeLogger} from '../utils/foreLogger/types.js';
import {getRedisRunConfig} from './redisRunConfig.js';

export async function validateRedisConfig(params: {
  configPath: string;
  logger: IForeLogger;
}) {
  const {configPath, logger} = params;
  try {
    await getRedisRunConfig({redisRunConfigFilepath: configPath});
    logger.log('✅ Redis config is valid');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`❌ Redis config is invalid: ${msg}`);
    throw err;
  }
}
