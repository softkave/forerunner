import fs from 'fs';
import {ensureDir} from 'fs-extra';
import path from 'path';
import {
  getRedisNodeConfigFilepath,
  getRedisNodeOutDir,
  getRedisSentinelConfigFilepath,
} from './paths.js';
import {RedisRunConfig} from './redisRunConfig.js';

function renderSaveLines(params: {
  rdbSnapshots: 'enabled' | 'disabled';
  save?: string[];
}) {
  const {rdbSnapshots, save} = params;
  if (rdbSnapshots !== 'enabled') {
    return ['save ""'];
  }
  const rules = save?.length
    ? save
    : [
        // Conservative defaults (similar intent to upstream defaults).
        '900 1',
        '300 10',
        '60 10000',
      ];
  return rules.map(rule => `save ${rule}`);
}

export function renderRedisConf(params: {
  redisRunConfig: RedisRunConfig;
  /** Port inside container (and typically mapped on host). */
  port: number;
  /** Whether this node is a replica of a master. */
  replicaOf?: {host: string; port: number};
  /** Enable cluster mode directives. */
  clusterEnabled?: boolean;
  /** Node-specific config folder name under redis-out/ */
  nodeName: string;
  /** Optional auth password. */
  password?: string;
}) {
  const {redisRunConfig, port, replicaOf, clusterEnabled, nodeName, password} =
    params;

  const persistence = redisRunConfig.persistence ?? {
    aof: 'enabled',
    rdbSnapshots: 'enabled',
  };

  const lines: string[] = [];

  // Networking (inside container): always bind all so other containers can
  // reach it. Exposure to the host is controlled by docker port mapping.
  lines.push(`bind 0.0.0.0 ::`);
  // `protected-mode yes` is a safety feature: when enabled, Redis is stricter
  // about accepting connections in potentially unsafe configurations (e.g. when
  // it's exposed and has no auth). It helps prevent accidental open Redis
  // instances. It does not replace proper firewalling/auth.
  lines.push(`protected-mode yes`);

  // Ports / TLS
  if (redisRunConfig.tls === 'enabled') {
    // For multi-node topologies, each node needs its own TLS port. We therefore
    // use the node port, except for single-mode where an explicit tlsPort can
    // be configured.
    const tlsPort =
      redisRunConfig.mode === 'single'
        ? (redisRunConfig.tlsConfig?.tlsPort ?? port)
        : port;
    lines.push(`port 0`);
    lines.push(`tls-port ${tlsPort}`);
    // Mounted read-only in container at /certs
    lines.push(`tls-cert-file /certs/server.crt.pem`);
    lines.push(`tls-key-file /certs/server.key.pem`);
    lines.push(`tls-ca-cert-file /certs/ca.crt.pem`);
    // Do not require client certs by default; password auth is used.
    lines.push(`tls-auth-clients no`);
  } else {
    lines.push(`port ${port}`);
  }

  // Working directory / persistence
  lines.push(`dir /data`);
  lines.push(`dbfilename dump.rdb`);

  // RDB snapshot rules
  lines.push(
    ...renderSaveLines({
      rdbSnapshots: persistence.rdbSnapshots ?? 'enabled',
      save: persistence.save,
    })
  );

  // AOF
  // AOF is a write-ahead log. With `appendfsync everysec` Redis asks the OS to
  // fsync about once per second (common durability/perf tradeoff).
  lines.push(`appendonly ${persistence.aof === 'enabled' ? 'yes' : 'no'}`);
  if (persistence.aof === 'enabled') {
    lines.push(`appendfilename appendonly.aof`);
    lines.push(`appendfsync everysec`);
  }

  // Memory policy
  if (redisRunConfig.memory?.maxmemory) {
    lines.push(`maxmemory ${redisRunConfig.memory.maxmemory}`);
    lines.push(`maxmemory-policy ${redisRunConfig.memory.policy}`);
  }

  // Authentication
  if (redisRunConfig.auth === 'enabled' && password) {
    lines.push(`requirepass ${password}`);
    // Used by replicas to auth to master.
    lines.push(`masterauth ${password}`);
  }

  // Replication
  if (replicaOf) {
    lines.push(`replicaof ${replicaOf.host} ${replicaOf.port}`);
  }

  // Cluster
  if (clusterEnabled) {
    lines.push(`cluster-enabled yes`);
    lines.push(`cluster-config-file nodes.conf`);
    lines.push(`cluster-node-timeout 5000`);
    // `cluster-announce-port` is the *client* TCP port other nodes/clients
    // should use for normal commands.
    lines.push(`cluster-announce-port ${port}`);
    // `cluster-announce-bus-port` is the *cluster bus* port used for node-to-node
    // gossip and failover coordination. By convention it's `port + 10000`.
    lines.push(`cluster-announce-bus-port ${port + 10000}`);
    // Prefer hostname-based announce when available.
    lines.push(`cluster-announce-hostname ${nodeName}`);
  }

  lines.push('');
  return lines.join('\n');
}

export function renderSentinelConf(params: {
  redisRunConfig: RedisRunConfig;
  sentinelPort: number;
  masterName: string;
  masterHost: string;
  masterPort: number;
  quorum: number;
  downAfterMs: number;
  failoverTimeoutMs: number;
  password?: string;
}) {
  const {
    redisRunConfig,
    sentinelPort,
    masterName,
    masterHost,
    masterPort,
    quorum,
    downAfterMs,
    failoverTimeoutMs,
    password,
  } = params;

  const lines: string[] = [];

  // Sentinel runs as a redis-server in sentinel mode.
  lines.push(`bind 0.0.0.0 ::`);
  lines.push(`protected-mode yes`);
  lines.push(`port ${sentinelPort}`);
  lines.push(`dir /data`);

  lines.push(
    `sentinel monitor ${masterName} ${masterHost} ${masterPort} ${quorum}`
  );
  lines.push(`sentinel down-after-milliseconds ${masterName} ${downAfterMs}`);
  lines.push(`sentinel failover-timeout ${masterName} ${failoverTimeoutMs}`);
  // `parallel-syncs` limits how many replicas may resync from the new master in
  // parallel after failover (reduces load spikes on the master).
  lines.push(`sentinel parallel-syncs ${masterName} 1`);

  if (redisRunConfig.auth === 'enabled' && password) {
    // Sentinel connects to master with this password.
    lines.push(`sentinel auth-pass ${masterName} ${password}`);
  }

  lines.push('');
  return lines.join('\n');
}

export async function writeRedisNodeConf(params: {
  redisRunConfig: RedisRunConfig;
  nodeName: string;
  port: number;
  replicaOf?: {host: string; port: number};
  clusterEnabled?: boolean;
  password?: string;
}) {
  const {redisRunConfig, nodeName} = params;
  const outDir = getRedisNodeOutDir({redisRunConfig, nodeName});
  await ensureDir(outDir);
  const filepath = getRedisNodeConfigFilepath({redisRunConfig, nodeName});
  const rendered = renderRedisConf({...params, nodeName});
  await fs.promises.writeFile(filepath, rendered, 'utf8');
  return {filepath, outDir: path.resolve(outDir)};
}

export async function writeSentinelConf(params: {
  redisRunConfig: RedisRunConfig;
  sentinelName: string;
  sentinelPort: number;
  masterName: string;
  masterHost: string;
  masterPort: number;
  quorum: number;
  downAfterMs: number;
  failoverTimeoutMs: number;
  password?: string;
}) {
  const {redisRunConfig, sentinelName, ...sentinelConfParams} = params;
  const outDir = path.join(
    redisRunConfig.workingDir,
    'redis-out',
    sentinelName
  );
  await ensureDir(outDir);
  const filepath = getRedisSentinelConfigFilepath({
    redisRunConfig,
    sentinelName,
  });
  // sentinelName is used for file layout only; the sentinel config itself
  // doesn't need to know its container name.
  const rendered = renderSentinelConf(sentinelConfParams);
  await fs.promises.writeFile(filepath, rendered, 'utf8');
  return {filepath, outDir: path.resolve(outDir)};
}
