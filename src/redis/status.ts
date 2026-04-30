import {execInContainer} from '../utils/docker.js';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {RedisRunConfig, ensureRedisPassword} from './redisRunConfig.js';
import {getRedisTopology} from './topology.js';
import {buildRedisCliArgs} from './redisCli.js';

async function pingNode(params: {
  containerName: string;
  redisRunConfig: RedisRunConfig;
  port: number;
  password?: string;
}) {
  return await execInContainer(params.containerName, [
    'redis-cli',
    ...buildRedisCliArgs(params),
    'PING',
  ]);
}

async function infoReplication(params: {
  containerName: string;
  redisRunConfig: RedisRunConfig;
  port: number;
  password?: string;
}) {
  return await execInContainer(params.containerName, [
    'redis-cli',
    ...buildRedisCliArgs(params),
    'INFO',
    'replication',
  ]);
}

export async function redisStatusMain(params: {
  redisRunConfig: RedisRunConfig;
  logger?: IForeLogger;
}) {
  const {redisRunConfig, logger = new ConsoleForeLogger({silent: true})} =
    params;
  const topology = getRedisTopology(redisRunConfig);
  const pwRes = await ensureRedisPassword({redisRunConfig});
  const password = pwRes.password;

  const rows: Array<Record<string, string>> = [];

  for (const node of topology.nodes) {
    const pong = await pingNode({
      containerName: node.name,
      redisRunConfig,
      port: node.port,
      password,
    });
    const repl = await infoReplication({
      containerName: node.name,
      redisRunConfig,
      port: node.port,
      password,
    });
    const roleLine = String(repl)
      .split('\n')
      .find(l => l.startsWith('role:'));
    rows.push({
      name: node.name,
      port: String(node.port),
      ping: String(pong).trim(),
      role: roleLine ? roleLine.replace('role:', '').trim() : 'unknown',
    });
  }

  if (topology.mode === 'cluster') {
    const first = topology.nodes[0]!;
    const clusterInfo = await execInContainer(first.name, [
      'redis-cli',
      ...buildRedisCliArgs({redisRunConfig, port: first.port, password}),
      'CLUSTER',
      'INFO',
    ]);
    logger.log('Cluster INFO:\n' + String(clusterInfo).trim());
  }

  if (topology.mode === 'sentinel') {
    const s0 = topology.sentinels[0];
    if (s0) {
      const masters = await execInContainer(s0.name, [
        'redis-cli',
        '-p',
        String(s0.port),
        'SENTINEL',
        'MASTERS',
      ]);
      logger.log('Sentinel MASTERS:\n' + String(masters).trim());
    }
  }

  logger.table(rows, ['name', 'port', 'ping', 'role']);
}
