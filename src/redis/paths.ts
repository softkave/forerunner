import path from 'path';
import {RedisRunConfig} from './redisRunConfig.js';

export function getRedisOutDir(
  redisRunConfig: Pick<RedisRunConfig, 'workingDir'>
) {
  return path.join(redisRunConfig.workingDir, 'redis-out');
}

export function getRedisCertOutDir(
  redisRunConfig: Pick<RedisRunConfig, 'workingDir'>
) {
  return path.join(getRedisOutDir(redisRunConfig), 'certs');
}

export function getRedisNodeOutDir(params: {
  redisRunConfig: Pick<RedisRunConfig, 'workingDir'>;
  nodeName: string;
}) {
  return path.join(getRedisOutDir(params.redisRunConfig), params.nodeName);
}

export function getRedisNodeConfigFilepath(params: {
  redisRunConfig: Pick<RedisRunConfig, 'workingDir'>;
  nodeName: string;
}) {
  return path.join(getRedisNodeOutDir(params), 'redis.conf');
}

export function getRedisSentinelConfigFilepath(params: {
  redisRunConfig: Pick<RedisRunConfig, 'workingDir'>;
  sentinelName: string;
}) {
  return path.join(
    getRedisOutDir(params.redisRunConfig),
    params.sentinelName,
    'sentinel.conf'
  );
}

export function getRedisPasswordCacheFilepath(
  redisRunConfig: Pick<RedisRunConfig, 'workingDir'>
) {
  return path.join(getRedisOutDir(redisRunConfig), 'redis.password');
}
