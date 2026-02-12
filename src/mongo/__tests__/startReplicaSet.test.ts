import {afterAll, beforeAll, describe, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/exports.js';
import {generateMongoPassword, setupReplicaSetMain} from '../index.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
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
  authorization: 'enabled',
};

const logger = new ConsoleForeLogger();

beforeAll(
  async () => {
    await cleanupMongoTest({mongoRunConfig});
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

describe('startReplicaSet', () => {
  test(
    'should start replica set',
    async () => {
      await setupReplicaSetMain({
        mongoRunConfig,
        logger,
        shouldSetupUsers: true,
      });
      await checkAdminCanConnect({mongoRunConfig, logger});
      await checkTestDbUserCanConnect({
        mongoRunConfig,
        logger,
        username: 'test-user-db',
      });
    },
    5 * 60 * 1000 // 5 minutes
  );
});
