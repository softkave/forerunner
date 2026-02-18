import {range} from 'lodash-es';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/exports.js';
import {checkMongoInstanceListening} from '../checkMongoReadyState.js';
import {
  generateMongoCertConfigsMain,
  generateMongoCertsMain,
  generateMongoPassword,
  startMongoMain,
  stopMongoMain,
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
  replicaSetName: 'test-softkave-forerunner-mongo',
};

beforeAll(
  async () => {
    await cleanupMongoTest({mongoRunConfig});
    await generateMongoCertConfigsMain({mongoRunConfig});
    await generateMongoCertsMain({logger, mongoRunConfig});
    await startMongoMain({
      mongoRunConfig,
      logger,
      waitUntilListening: true,
    });
  },
  1 * 60 * 1000 // 1 minute
);

afterAll(async () => {
  await cleanupMongoTest({
    mongoRunConfig,
    cleanInstances: true,
    cleanDirs: false,
  });
});

describe('stopMongo', () => {
  test(
    'should stop MongoDB instance',
    async () => {
      await stopMongoMain({mongoRunConfig, logger});

      // Confirm that the instances are not listening
      for (const instanceNumber of range(
        0,
        mongoRunConfig.instancePorts.length
      )) {
        const result = await checkMongoInstanceListening({
          mongoRunConfig,
          instanceNumber: instanceNumber + 1,
          logger,
          retries: 0,
          connectTimeoutMs: 2_000,
        });
        expect(result).toBe(false);
      }
    },
    5 * 60 * 1000 // 5 minutes
  );
});
