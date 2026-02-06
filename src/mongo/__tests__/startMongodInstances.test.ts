import {afterAll, beforeAll, describe, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/exports.js';
import {
  assertMongoInstancesListening,
  generateMongoCertConfigsMain,
  generateMongoCertsMain,
  generateMongoPassword,
} from '../index.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {startMongodInstancesMain} from '../startMongodInstances.js';
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
  instancesHostnames: [
    'test-1.softkave-forerunner-mongo.fimidara.com',
    'test-2.softkave-forerunner-mongo.fimidara.com',
    'test-3.softkave-forerunner-mongo.fimidara.com',
  ],
  instancePorts: [27030, 27031, 27032],
  replicaCount: 3,
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
  replicaSetName: 'test-softkave-forerunner-mongo',
  authorization: 'enabled',
};

beforeAll(
  async () => {
    await cleanupMongoTest({mongoRunConfig});
    await generateMongoCertConfigsMain({mongoRunConfig});
    await generateMongoCertsMain({logger, mongoRunConfig});
  },
  5 * 60 * 1000 // 5 minutes
);

afterAll(async () => {
  // await cleanupMongoTest({mongoRunConfig});
});

describe('startMongodInstances', () => {
  test(
    'should start mongod instances',
    async () => {
      await startMongodInstancesMain({
        mongoRunConfig,
        logger: new ConsoleForeLogger(),
        waitUntilListening: true,
      });
      await assertMongoInstancesListening({
        mongoRunConfig,
        logger,
        preferLocalhost: false,
      });
    },
    5 * 60 * 1000 // 5 minutes
  );
});
