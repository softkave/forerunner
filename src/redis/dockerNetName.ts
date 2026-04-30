import crypto from 'crypto';

/**
 * Redis topologies need a user-defined Docker network so containers can resolve
 * each other by name (e.g. `redis-sentinel-master:6379`).
 *
 * We derive the name from `workingDir` so separate working directories don't
 * collide.
 */
export function getRedisNetworkName(params: {workingDir: string}) {
  const hash = crypto
    .createHash('sha256')
    .update(params.workingDir)
    .digest('hex')
    .slice(0, 12);
  return `forerunner-redis-${hash}`;
}
