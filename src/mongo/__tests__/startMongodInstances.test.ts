import {afterAll, beforeAll, describe, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/exports.js';
import {downloadMongo} from '../downloadMongo.js';
import {
  generateMongoCertConfigsMain,
  generateMongoCertsMain,
  generateMongodConfigsMain,
  generateMongoPassword,
} from '../index.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {startMongodInstancesMain} from '../startMongodInstances.js';
import {endMongoInstancesForTest} from '../testHelpers.js';

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
  authorization: 'disabled',
};

beforeAll(
  async () => {
    await endMongoInstancesForTest({mongoRunConfig});

    await downloadMongo({mongoRunConfig, logger});
    await generateMongoCertConfigsMain({mongoRunConfig});
    await generateMongoCertsMain({logger, mongoRunConfig});
    await generateMongodConfigsMain({mongoRunConfig});
  },
  5 * 60 * 1000 // 5 minutes
);

afterAll(async () => {
  // await cleanupMongoTest({
  //   mongoRunConfig,
  // });
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
    },
    5 * 60 * 1000 // 5 minutes
  );
});
