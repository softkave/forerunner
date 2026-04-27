import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/exports.js';
import {
  findAdminUser,
  generateMongoPassword,
  getExistingUsers,
  setupMongoUsers,
  setupReplicaSetMain,
} from '../index.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {
  checkAdminCanConnect,
  checkTestDbUserCanConnect,
  checkUserHasRole,
  cleanupMongoTest,
} from '../testHelpers.js';

const baseConfig: MongoRunConfig = {
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
  ports: [27040, 27041, 27042],
  users: [
    {
      username: 'test-setup-admin',
      roles: [{role: 'userAdminAnyDatabase', db: 'admin'}],
      password: generateMongoPassword(),
    },
    {
      username: 'test-setup-cluster-admin',
      roles: [{role: 'clusterAdmin', db: 'admin'}],
      password: generateMongoPassword(),
    },
    {
      username: 'test-setup-db-user',
      roles: [{role: 'readWrite', db: 'test-db'}],
      password: generateMongoPassword(),
    },
  ],
  workingDir: 'testdir/mongo/test-setup-users-mongo',
  mongoVersion: '8.2.3',
  replicaSetName: 'test-setup-users-mongo',
  authorization: 'enabled',
};

const logger = new ConsoleForeLogger();

beforeAll(
  async () => {
    await cleanupMongoTest({mongoRunConfig: baseConfig});
    await setupReplicaSetMain({
      mongoRunConfig: baseConfig,
      logger,
      shouldSetupUsers: false,
    });
  },
  1 * 60 * 1000 // 1 minute
);

afterAll(async () => {
  await cleanupMongoTest({
    mongoRunConfig: baseConfig,
    cleanInstances: true,
    cleanDirs: false,
  });
});

describe('setupUsers', () => {
  test(
    'adds new user when not in DB',
    async () => {
      const newUser = {
        username: 'test-setup-new-user',
        roles: [{role: 'read', db: 'test-db'}],
        password: generateMongoPassword(),
      };
      const configWithNewUser: MongoRunConfig = {
        ...baseConfig,
        users: [...baseConfig.users, newUser],
      };
      await setupMongoUsers({
        mongoRunConfig: configWithNewUser,
        logger,
        authUser: findAdminUser({
          users: baseConfig.users,
          isRequired: true,
        }),
      });
      await checkTestDbUserCanConnect({
        mongoRunConfig: configWithNewUser,
        logger,
        username: 'test-setup-new-user',
      });
    },
    1 * 60 * 1000 // 1 minute
  );

  test(
    'updates roles for existing user',
    async () => {
      const adminUser = findAdminUser({
        users: baseConfig.users,
        isRequired: true,
      });
      const configWithUpdatedRole: MongoRunConfig = {
        ...baseConfig,
        users: baseConfig.users.map(u =>
          u.username === 'test-setup-db-user'
            ? {
                ...u,
                roles: [
                  {role: 'readWrite', db: 'test-db'},
                  {role: 'read', db: 'other-db'},
                ],
              }
            : u
        ),
      };
      await setupMongoUsers({
        mongoRunConfig: configWithUpdatedRole,
        logger,
        authUser: adminUser,
      });
      await checkUserHasRole({
        mongoRunConfig: configWithUpdatedRole,
        logger,
        username: 'test-setup-db-user',
        role: 'read',
        db: 'other-db',
      });
    },
    1 * 60 * 1000 // 1 minute
  );

  test(
    'removes users not in config',
    async () => {
      const adminUser = findAdminUser({
        users: baseConfig.users,
        isRequired: true,
      });
      const configWithoutNewUser: MongoRunConfig = {
        ...baseConfig,
        users: baseConfig.users.filter(
          u => u.username !== 'test-setup-new-user'
        ),
      };
      await setupMongoUsers({
        mongoRunConfig: configWithoutNewUser,
        logger,
        authUser: adminUser,
      });
      await expect(() =>
        checkTestDbUserCanConnect({
          mongoRunConfig: {
            ...baseConfig,
            users: [
              ...baseConfig.users,
              {
                username: 'test-setup-new-user',
                roles: [{role: 'read', db: 'test-db'}],
                password: 'any',
              },
            ],
          },
          logger,
          username: 'test-setup-new-user',
        })
      ).rejects.toThrow();
    },
    1 * 60 * 1000 // 1 minute
  );

  test(
    'does not remove sole admin when not in config',
    async () => {
      const adminUser = findAdminUser({
        users: baseConfig.users,
        isRequired: true,
      });
      const configWithNoAdmin: MongoRunConfig = {
        ...baseConfig,
        users: baseConfig.users.filter(
          u => !u.roles.some(r => r.role === 'userAdminAnyDatabase')
        ),
      };
      await setupMongoUsers({
        mongoRunConfig: configWithNoAdmin,
        logger,
        authUser: adminUser,
      });
      const existing = await getExistingUsers({
        mongoRunConfig: baseConfig,
        logger,
        authUser: adminUser,
        connectionType: 'replicaSet',
      });
      const adminStillExists = existing.some(
        u => u.username === 'test-setup-admin'
      );
      expect(adminStillExists).toBe(true);
      await checkAdminCanConnect({mongoRunConfig: baseConfig, logger});
    },
    1 * 60 * 1000 // 1 minute
  );
});
