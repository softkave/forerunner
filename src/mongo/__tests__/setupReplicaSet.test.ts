import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/exports.js';
import {generateMongoPassword, setupReplicaSetMain} from '../index.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {setupReplicaSet} from '../setupReplicaSet.js';
import {checkAdminCanConnect, cleanupMongoTest} from '../testHelpers.js';

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
  hostnames: [
    'test-1.softkave-forerunner-mongo.fimidara.com',
    'test-2.softkave-forerunner-mongo.fimidara.com',
    'test-3.softkave-forerunner-mongo.fimidara.com',
  ],
  ports: [27070, 27071, 27072],
  users: [
    {
      username: 'test-repl-init-admin',
      roles: [{role: 'userAdminAnyDatabase', db: 'admin'}],
      password: generateMongoPassword(),
    },
    {
      username: 'test-repl-init-cluster-admin',
      roles: [{role: 'clusterAdmin', db: 'admin'}],
      password: generateMongoPassword(),
    },
  ],
  workingDir: 'testdir/mongo/test-setup-replica-set-idempotent',
  mongoVersion: '8.2.3',
  replicaSetName: 'test-setup-replica-set-idempotent',
  authorization: 'enabled',
};

const logger = new ConsoleForeLogger({silent: true});

beforeAll(
  async () => {
    await cleanupMongoTest({mongoRunConfig});
    await setupReplicaSetMain({
      mongoRunConfig,
      logger,
      shouldSetupUsers: true,
    });
    await checkAdminCanConnect({mongoRunConfig, logger});
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

describe('setupReplicaSet', () => {
  test(
    'does not attempt to initialize when replica set is already initialized',
    async () => {
      // If `setupReplicaSet` incorrectly tried `rs.initiate(...)` again, mongosh
      // would fail with an "already initialized" error and this would throw.
      await expect(
        setupReplicaSet({
          mongoRunConfig,
          logger,
          adminUser: mongoRunConfig.users[0],
          clusterAdminUser: mongoRunConfig.users[1],
        })
      ).resolves.toEqual({alreadyInitialized: true});
    },
    1 * 60 * 1000 // 1 minute
  );
});
