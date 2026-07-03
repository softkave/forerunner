import getPort from 'get-port';
import {afterAll, describe, expect, test} from 'vitest';
import {dockerNetworkExists} from '../../utils/docker.js';
import {ConsoleForeLogger} from '../../utils/foreLogger/ConsoleForeLogger.js';
import {
  assertMongoInstancesListening,
  assertMongoReplicaSetReady,
} from '../checkMongoReadyState.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {
  buildQuickMongoRunConfig,
  getDefaultDevHostname,
  getDefaultMongoDockerNetworkName,
} from '../quickStartConfig.js';
import {startMongoMain} from '../startMongo.js';
import {stopMongoMain} from '../stopMongo.js';
import {cleanupMongoTest} from '../testHelpers.js';

const logger = new ConsoleForeLogger({silent: true});

const configsToCleanup: MongoRunConfig[] = [];

afterAll(async () => {
  for (const config of configsToCleanup) {
    await cleanupMongoTest({
      mongoRunConfig: config,
      cleanInstances: true,
      cleanDirs: false,
    });
  }
});

describe('mongo quick start with dev.local hostnames', () => {
  test(
    'starts replica set without config file using dev.local hostnames',
    async () => {
      const containerName = 'test-mongo-quick';
      const ports = await Promise.all([getPort(), getPort(), getPort()]);

      const mongoRunConfig = buildQuickMongoRunConfig({
        containerName,
        ports,
        etcHostsSetup: 'add',
      });
      configsToCleanup.push(mongoRunConfig);

      await cleanupMongoTest({
        mongoRunConfig,
        cleanDirs: false,
        cleanLogs: true,
        cleanInstances: true,
      });

      expect(mongoRunConfig.dockerNetwork).toBe(
        getDefaultMongoDockerNetworkName(containerName)
      );

      await startMongoMain({
        mongoRunConfig,
        logger,
        waitUntilListening: true,
        shouldInitDbRootUser: false,
        shouldSetupReplicaSet: true,
        printUri: false,
      });

      expect(await dockerNetworkExists(mongoRunConfig.dockerNetwork!)).toBe(
        true
      );

      await assertMongoInstancesListening({
        mongoRunConfig,
        logger,
        preferLocalhost: true,
      });

      await assertMongoReplicaSetReady({
        mongoRunConfig,
        logger,
        preferLocalhost: false,
      });

      for (let i = 1; i <= ports.length; i++) {
        expect(getDefaultDevHostname(containerName, i)).toBe(
          `${containerName}-mongod-${i}.dev.local`
        );
      }

      await stopMongoMain({mongoRunConfig, logger});
      expect(await dockerNetworkExists(mongoRunConfig.dockerNetwork!)).toBe(
        false
      );
    },
    40 * 1000
  );

  test.only(
    'starts replica set with auth when user and password are provided',
    async () => {
      const containerName = 'test-mongo-auth';
      const ports = await Promise.all([getPort(), getPort(), getPort()]);

      const mongoRunConfig = buildQuickMongoRunConfig({
        containerName,
        ports,
        user: 'admin',
        password: 'admin-secret',
        etcHostsSetup: 'add',
      });
      configsToCleanup.push(mongoRunConfig);

      await cleanupMongoTest({
        mongoRunConfig,
        cleanDirs: false,
        cleanLogs: true,
      });

      await startMongoMain({
        mongoRunConfig,
        logger,
        waitUntilListening: true,
        shouldInitDbRootUser: true,
        shouldSetupReplicaSet: true,
        printUri: false,
      });

      await assertMongoReplicaSetReady({
        mongoRunConfig,
        logger,
        preferLocalhost: false,
        authUser: {
          username: 'admin',
          password: 'admin-secret',
        },
      });

      await stopMongoMain({mongoRunConfig, logger});
    },
    40 * 1000
  );
});
