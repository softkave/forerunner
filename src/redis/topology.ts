import {RedisRunConfig} from './redisRunConfig.js';

export type RedisNodeRole = 'single' | 'cluster' | 'master' | 'replica';

export interface RedisNodeSpec {
  name: string;
  role: RedisNodeRole;
  port: number;
  /** If replica, points to master address on the docker network. */
  replicaOf?: {host: string; port: number};
  /** Cluster nodes should have cluster-enabled directives. */
  clusterEnabled?: boolean;
  /** Named volume for /data. */
  volumeName: string;
}

export interface RedisSentinelSpec {
  name: string;
  port: number;
  volumeName: string;
}

export interface RedisTopologySingle {
  mode: 'single';
  nodes: [RedisNodeSpec];
  sentinels: [];
}

export interface RedisTopologyCluster {
  mode: 'cluster';
  nodes: RedisNodeSpec[];
  sentinels: [];
}

export interface RedisTopologySentinel {
  mode: 'sentinel';
  nodes: RedisNodeSpec[]; // master + replicas
  sentinels: RedisSentinelSpec[];
  masterName: string;
}

export type RedisTopology =
  | RedisTopologySingle
  | RedisTopologyCluster
  | RedisTopologySentinel;

function volumeNameForNode(params: {
  redisRunConfig: RedisRunConfig;
  containerName: string;
}) {
  if (params.redisRunConfig.mode === 'single') {
    return (
      params.redisRunConfig.volumeName ?? params.redisRunConfig.containerName
    );
  }
  return `${params.containerName}-data`;
}

export function getRedisTopology(
  redisRunConfig: RedisRunConfig
): RedisTopology {
  if (redisRunConfig.mode === 'single') {
    const name = redisRunConfig.containerName;
    const port = redisRunConfig.port ?? 6379;
    return {
      mode: 'single',
      nodes: [
        {
          name,
          role: 'single',
          port,
          volumeName: volumeNameForNode({redisRunConfig, containerName: name}),
        },
      ],
      sentinels: [],
    };
  }

  if (redisRunConfig.mode === 'cluster') {
    const masters = redisRunConfig.masters;
    const replicasPerMaster = redisRunConfig.replicasPerMaster;
    const totalNodes = masters * (1 + replicasPerMaster);
    const basePort = redisRunConfig.basePort;
    const prefix = redisRunConfig.containerNamePrefix;

    const nodes: RedisNodeSpec[] = [];
    for (let i = 0; i < totalNodes; i++) {
      const idx = i + 1;
      const name = `${prefix}-node-${idx}`;
      const port = basePort + i;
      nodes.push({
        name,
        role: 'cluster',
        port,
        clusterEnabled: true,
        volumeName: volumeNameForNode({redisRunConfig, containerName: name}),
      });
    }

    return {mode: 'cluster', nodes, sentinels: []};
  }

  // sentinel
  const prefix = redisRunConfig.containerNamePrefix;
  const masterName = `${prefix}-master`;
  const masterPort = redisRunConfig.masterPort;
  const replicas = redisRunConfig.replicas;
  const replicaBasePort = redisRunConfig.replicaBasePort;
  const sentinels = redisRunConfig.sentinels;
  const sentinelBasePort = redisRunConfig.sentinelBasePort;

  const nodes: RedisNodeSpec[] = [
    {
      name: masterName,
      role: 'master',
      port: masterPort,
      volumeName: volumeNameForNode({
        redisRunConfig,
        containerName: masterName,
      }),
    },
  ];

  for (let i = 0; i < replicas; i++) {
    const idx = i + 1;
    const name = `${prefix}-replica-${idx}`;
    const port = replicaBasePort + i;
    nodes.push({
      name,
      role: 'replica',
      port,
      replicaOf: {host: masterName, port: masterPort},
      volumeName: volumeNameForNode({redisRunConfig, containerName: name}),
    });
  }

  const sentinelSpecs: RedisSentinelSpec[] = [];
  for (let i = 0; i < sentinels; i++) {
    const idx = i + 1;
    const name = `${prefix}-sentinel-${idx}`;
    const port = sentinelBasePort + i;
    sentinelSpecs.push({
      name,
      port,
      volumeName: `${name}-data`,
    });
  }

  return {
    mode: 'sentinel',
    nodes,
    sentinels: sentinelSpecs,
    masterName,
  };
}
