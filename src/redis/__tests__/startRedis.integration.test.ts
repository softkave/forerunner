import fs from 'fs';
import getPort from 'get-port';
import os from 'os';
import path from 'path';
import {createClient, createCluster, createSentinel} from 'redis';
import {afterAll, describe, expect, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/foreLogger/ConsoleForeLogger.js';
import {RedisRunConfig, redisRunConfigSchema} from '../redisRunConfig.js';
import {startRedisMain} from '../startRedis.js';
import {getRedisTopology} from '../topology.js';
import {
  allocateSentinelPorts,
  cleanupRedisTest,
  getConsecutiveFreePorts,
  waitUntilContainerStopped,
} from './testHelpers.js';

const logger = new ConsoleForeLogger({silent: true});

const kPassword = 'forerunner-redis-integration-test';

const configsToCleanup: RedisRunConfig[] = [];
const tempDirs: string[] = [];

afterAll(async () => {
  for (const config of configsToCleanup) {
    await cleanupRedisTest({redisRunConfig: config, removeVolumes: true});
  }
  for (const dir of tempDirs) {
    await fs.promises.rm(dir, {recursive: true, force: true});
  }
});

describe.sequential('startRedisMain (Docker)', () => {
  test(
    'single mode: SET/GET over TCP',
    async () => {
      const workingDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'forerunner-redis-single-')
      );
      tempDirs.push(workingDir);

      const port = await getPort({host: '127.0.0.1'});
      const containerName = `test-redis-single-${Date.now()}`;
      const config = redisRunConfigSchema.parse({
        mode: 'single',
        workingDir,
        containerName,
        port,
        auth: 'enabled',
        password: kPassword,
        keep: false,
        discoverability: 'local',
      }) as RedisRunConfig;
      configsToCleanup.push(config);

      await startRedisMain({
        redisRunConfig: config,
        logger,
        waitUntilListening: true,
      });

      const client = createClient({
        socket: {host: '127.0.0.1', port},
        password: kPassword,
      });
      await client.connect();
      try {
        await client.set('forerunner:int:single', 'ok');
        expect(await client.get('forerunner:int:single')).toBe('ok');
      } finally {
        await client.close();
      }

      await cleanupRedisTest({redisRunConfig: config, removeVolumes: true});
      await waitUntilContainerStopped(containerName);
    },
    3 * 60 * 1000
  );

  test(
    'cluster mode: SET/GET via cluster client',
    async () => {
      const workingDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'forerunner-redis-cluster-')
      );
      tempDirs.push(workingDir);

      const basePort = await getConsecutiveFreePorts(3);
      const containerNamePrefix = `test-redis-cl-${Date.now()}`;
      const config = redisRunConfigSchema.parse({
        mode: 'cluster',
        workingDir,
        containerNamePrefix,
        masters: 3,
        replicasPerMaster: 0,
        basePort,
        auth: 'enabled',
        password: kPassword,
        keep: false,
        discoverability: 'local',
      }) as RedisRunConfig;
      configsToCleanup.push(config);

      await startRedisMain({
        redisRunConfig: config,
        logger,
        waitUntilListening: true,
      });

      const cluster = createCluster({
        rootNodes: [0, 1, 2].map(i => ({
          url: `redis://127.0.0.1:${basePort + i}`,
        })),
        defaults: {password: kPassword},
      });
      await cluster.connect();
      try {
        await cluster.set('forerunner:int:cluster', 'ok');
        expect(await cluster.get('forerunner:int:cluster')).toBe('ok');
      } finally {
        await cluster.close();
      }

      await cleanupRedisTest({redisRunConfig: config, removeVolumes: true});
    },
    5 * 60 * 1000
  );

  test(
    'sentinel mode: SET/GET via createSentinel (nodeAddressMap for published ports)',
    async () => {
      const workingDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'forerunner-redis-sentinel-')
      );
      tempDirs.push(workingDir);

      const {masterPort, replicaBasePort, sentinelBasePort} =
        await allocateSentinelPorts({replicas: 1, sentinels: 1});

      const containerNamePrefix = `test-redis-sen-${Date.now()}`;
      const config = redisRunConfigSchema.parse({
        mode: 'sentinel',
        workingDir,
        containerNamePrefix,
        masterPort,
        replicas: 1,
        replicaBasePort,
        sentinels: 1,
        sentinelBasePort,
        quorum: 1,
        auth: 'enabled',
        password: kPassword,
        keep: false,
        discoverability: 'local',
      }) as RedisRunConfig;
      configsToCleanup.push(config);

      const topology = getRedisTopology(config);
      if (topology.mode !== 'sentinel') {
        throw new Error('expected sentinel topology');
      }
      const masterName = topology.masterName;

      await startRedisMain({
        redisRunConfig: config,
        logger,
        waitUntilListening: true,
      });

      const sentinel = await createSentinel({
        name: masterName,
        sentinelRootNodes: [{host: '127.0.0.1', port: sentinelBasePort}],
        nodeClientOptions: {
          password: kPassword,
        },
        nodeAddressMap(address: string) {
          const port = Number(address.slice(address.lastIndexOf(':') + 1));
          return {host: '127.0.0.1', port};
        },
      }).connect();

      try {
        await sentinel.set('forerunner:int:sentinel', 'ok');
        expect(await sentinel.get('forerunner:int:sentinel')).toBe('ok');
      } finally {
        await sentinel.close();
      }

      await cleanupRedisTest({redisRunConfig: config, removeVolumes: true});
    },
    5 * 60 * 1000
  );
});
