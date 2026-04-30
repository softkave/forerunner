import {RedisRunConfig} from './redisRunConfig.js';

/**
 * Build arguments for `redis-cli` when executed *inside* a container.
 *
 * Notes:
 * - We pass `--cacert /certs/ca.crt.pem` because our TLS certs are mounted at `/certs`.
 * - `-a` is used for `requirepass` auth (simple password auth).
 */
export function buildRedisCliArgs(params: {
  redisRunConfig: RedisRunConfig;
  port: number;
  password?: string;
}) {
  const {redisRunConfig, port, password} = params;
  const args: string[] = [];
  if (redisRunConfig.tls === 'enabled') {
    args.push('--tls', '--cacert', '/certs/ca.crt.pem');
  }
  args.push('-p', String(port));
  if (redisRunConfig.auth === 'enabled' && password) {
    args.push('-a', password);
  }
  return args;
}
