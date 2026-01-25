import {afterAll, beforeAll, describe, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/exports.js';
import {generateMongoPassword, initMongo} from '../index.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {restartMongo} from '../restart/restart.js';
import {
  checkAdminCanConnect,
  checkTestDbUserCanConnect,
  cleanupMongoTest,
} from '../testHelpers.js';

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
    {
      username: 'test-user-cluster-admin',
      roles: [{role: 'clusterAdmin', db: 'admin'}],
      password: generateMongoPassword(),
    },
    {
      username: 'test-user-db',
      roles: [{role: 'readWrite', db: 'test-db'}],
      password: generateMongoPassword(),
    },
  ],
  workingDir: 'testdir/mongo/test-softkave-forerunner-mongo',
  bindLocalhost: true,
  mongoVersion: '8.2.3',
  replicaSetName: 'test-softkave-forerunner-mongo',
};

const logger = new ConsoleForeLogger();

beforeAll(async () => {
  await initMongo({
    mongoRunConfig,
    logger,
  });
});

afterAll(async () => {
  await cleanupMongoTest({
    mongoRunConfig,
  });
});

describe('restartMongo', () => {
  test(
    'should restart mongo',
    async () => {
      await restartMongo({
        mongoRunConfig,
        logger,
      });

      await checkAdminCanConnect({
        mongoRunConfig,
        logger,
      });

      await checkTestDbUserCanConnect({
        mongoRunConfig,
        logger,
        username: 'test-user-db',
      });
    },
    10 * 60 * 1000 // 10 minutes
  );
});
