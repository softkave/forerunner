import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/exports.js';
import {generateMongoPassword, initMongo, upgradeMongo} from '../index.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {
  checkMongoVersion,
  checkTestDbUserCanConnect,
  checkUserHasRole,
  cleanupMongoTest,
} from '../testHelpers.js';

const mongoRunConfig01: MongoRunConfig = {
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
      username: 'test-user-db-01',
      roles: [{role: 'readWrite', db: 'test-db'}],
      password: generateMongoPassword(),
    },
    {
      username: 'test-user-db-02',
      roles: [{role: 'read', db: 'test-db'}],
      password: generateMongoPassword(),
    },
  ],
  workingDir: 'testdir/mongo/test-softkave-forerunner-mongo',
  bindLocalhost: true,
  mongoVersion: '8.2.2',
  replicaSetName: 'test-softkave-forerunner-mongo',
};

const logger = new ConsoleForeLogger();

beforeAll(async () => {
  await initMongo({
    mongoRunConfig: mongoRunConfig01,
    logger,
  });
});

afterAll(async () => {
  await cleanupMongoTest({
    mongoRunConfig: mongoRunConfig01,
  });
});

describe('upgradeMongo', () => {
  test(
    'should upgrade mongo version',
    async () => {
      await checkMongoVersion({
        mongoRunConfig: mongoRunConfig01,
        logger,
        expectedVersion: '8.2.2',
      });

      const mongoRunConfig02: MongoRunConfig = {
        ...mongoRunConfig01,
        mongoVersion: '8.2.3',
        users: [
          // Removed test-user-db-01 user
          ...mongoRunConfig01.users.filter(
            user => user.username !== 'test-user-db-01'
          ),
          // Added test-user-db-new user
          {
            username: 'test-user-db-new',
            roles: [{role: 'readWrite', db: 'test-db'}],
            password: generateMongoPassword(),
          },
          // Updated test-user-db-02 user role to readWrite and password
          {
            username: 'test-user-db-02',
            roles: [{role: 'readWrite', db: 'test-db'}],
            password: generateMongoPassword(),
          },
        ],
      };

      await upgradeMongo({
        mongoRunConfig: mongoRunConfig02,
        logger,
      });

      await checkMongoVersion({
        mongoRunConfig: mongoRunConfig02,
        logger,
        expectedVersion: '8.2.3',
      });

      await checkTestDbUserCanConnect({
        mongoRunConfig: mongoRunConfig02,
        logger,
        username: 'test-user-db-new',
      });

      await checkTestDbUserCanConnect({
        mongoRunConfig: mongoRunConfig02,
        logger,
        username: 'test-user-db-02',
      });

      await expect(() =>
        checkTestDbUserCanConnect({
          mongoRunConfig: mongoRunConfig02,
          logger,
          username: 'test-user-db-01',
        })
      ).rejects.toThrow();

      await checkUserHasRole({
        mongoRunConfig: mongoRunConfig02,
        logger,
        username: 'test-user-db-02',
        role: 'readWrite',
        db: 'test-db',
      });
    },
    10 * 60 * 1000 // 10 minutes
  );
});
