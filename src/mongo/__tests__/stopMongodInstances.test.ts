import {range} from 'lodash-es';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/exports.js';
import {checkMongoInstanceListening} from '../checkMongoReadyState.js';
import {
  generateMongoCertConfigsMain,
  generateMongoCertsMain,
  generateMongoPassword,
  startMongodInstancesMain,
  stopMongodInstancesMain,
} from '../index.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {cleanupMongoTest} from '../testHelpers.js';

const logger = new ConsoleForeLogger();

const mongoRunConfig: MongoRunConfig = {
  caConfig: {
    days: 3650,
    subject: {
      C: 'US',
      ST: 'Delaware',
      L: 'Dover',
      O: 'softkave-forerunner-mongo',
      CN: 'softkave-forerunner-mongo CA',
    },
  },
  instancesHostnames: ['test-1.softkave-forerunner-mongo.fimidara.com'],
  instancePorts: [27030],
  users: [
    {
      username: 'test-user-admin',
      roles: [{role: 'userAdminAnyDatabase', db: 'admin'}],
      password: generateMongoPassword(),
    },
  ],
  workingDir: 'testdir/mongo/test-softkave-forerunner-mongo',
  bindLocalhost: true,
  mongoVersion: '8.2.3',
  authorization: 'enabled',
};

beforeAll(
  async () => {
    await cleanupMongoTest({mongoRunConfig});
    await generateMongoCertConfigsMain({mongoRunConfig});
    await generateMongoCertsMain({logger, mongoRunConfig});
    await startMongodInstancesMain({
      mongoRunConfig,
      logger,
      waitUntilListening: true,
    });
  },
  5 * 60 * 1000 // 5 minutes
);

afterAll(async () => {
  await cleanupMongoTest({mongoRunConfig});
});

describe('stopMongodInstances', () => {
  test(
    'should stop mongod instances',
    async () => {
      await stopMongodInstancesMain({mongoRunConfig, logger});

      // Confirm that the instances are not listening
      for (const instanceNumber of range(
        0,
        mongoRunConfig.instancePorts.length
      )) {
        const result = await checkMongoInstanceListening({
          mongoRunConfig,
          instanceNumber: instanceNumber + 1,
          logger,
          retries: 1,
          connectTimeoutMs: 2_000,
        });
        expect(result).toBe(false);
      }
    },
    5 * 60 * 1000 // 5 minutes
  );
});
