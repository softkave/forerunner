import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import getPort from 'get-port';
import {ConsoleForeLogger} from '../../utils/foreLogger/ConsoleForeLogger.js';
import {setupDatabases, setupUsers, startPostgresInstance} from '../index.js';
import {PostgresRunConfig} from '../postgresRunConfig.js';
import {
  checkUserCanConnect,
  checkUserCannotConnect,
  cleanupPostgresTest,
} from './testHelpers.js';

const logger = new ConsoleForeLogger({silent: true});

let testPort: number;
let baseConfig: PostgresRunConfig;

beforeAll(
  async () => {
    testPort = await getPort();
    baseConfig = {
      workingDir: process.cwd(),
      port: testPort,
      containerName: `test-pg-setup-users-${Date.now()}`,
      volumeName: `test-pg-setup-users-${Date.now()}`,
      keep: false,
      authorization: 'enabled',
      ssl: 'disabled',
      postgresVersion: '16',
      users: [{username: 'admin', password: 'admin-secret'}],
      dbs: ['mydb', 'appdb', 'otherdb'],
    };

    await startPostgresInstance({
      postgresRunConfig: baseConfig,
      logger,
      waitUntilListening: true,
    });

    await setupDatabases({
      postgresRunConfig: baseConfig,
      logger,
    });

    await setupUsers({
      postgresRunConfig: baseConfig,
      logger,
    });
  },
  2 * 60 * 1000
);

afterAll(async () => {
  await cleanupPostgresTest({postgresRunConfig: baseConfig});
});

describe('setupUsers - user and access management', () => {
  test(
    'admin can connect to default database',
    async () => {
      const ok = await checkUserCanConnect({
        postgresRunConfig: baseConfig,
        username: 'admin',
        password: 'admin-secret',
        database: 'mydb',
        logger,
      });
      expect(ok).toBe(true);
    },
    10 * 1000
  );

  test(
    'adds new user with password and grants access to specific database',
    async () => {
      const configWithNewUser: PostgresRunConfig = {
        ...baseConfig,
        users: [
          ...baseConfig.users!,
          {
            username: 'appuser',
            password: 'app-secret',
            databases: ['appdb'],
          },
        ],
      };
      await setupUsers({
        postgresRunConfig: configWithNewUser,
        logger,
      });

      const canConnectAppDb = await checkUserCanConnect({
        postgresRunConfig: configWithNewUser,
        username: 'appuser',
        password: 'app-secret',
        database: 'appdb',
        logger,
      });
      expect(canConnectAppDb).toBe(true);

      const cannotConnectOther = await checkUserCannotConnect({
        postgresRunConfig: configWithNewUser,
        username: 'appuser',
        password: 'app-secret',
        database: 'otherdb',
        logger,
      });
      expect(cannotConnectOther).toBe(true);
    },
    30 * 1000
  );

  test(
    'updates user database list - revokes removed db and grants new one',
    async () => {
      const configUpdatedDbs: PostgresRunConfig = {
        ...baseConfig,
        users: [
          baseConfig.users![0],
          {
            username: 'appuser',
            password: 'app-secret',
            databases: ['otherdb'], // was appdb, now otherdb
          },
        ],
      };
      await setupUsers({
        postgresRunConfig: configUpdatedDbs,
        logger,
      });

      const cannotConnectAppDb = await checkUserCannotConnect({
        postgresRunConfig: configUpdatedDbs,
        username: 'appuser',
        password: 'app-secret',
        database: 'appdb',
        logger,
      });
      expect(cannotConnectAppDb).toBe(true);

      const canConnectOtherDb = await checkUserCanConnect({
        postgresRunConfig: configUpdatedDbs,
        username: 'appuser',
        password: 'app-secret',
        database: 'otherdb',
        logger,
      });
      expect(canConnectOtherDb).toBe(true);
    },
    30 * 1000
  );

  test(
    'updates user password when changed in config',
    async () => {
      const newPassword = 'app-new-secret';
      const configNewPassword: PostgresRunConfig = {
        ...baseConfig,
        users: [
          baseConfig.users![0],
          {
            username: 'appuser',
            password: newPassword,
            databases: ['otherdb'],
          },
        ],
      };
      await setupUsers({
        postgresRunConfig: configNewPassword,
        logger,
      });

      const oldPasswordFails = await checkUserCannotConnect({
        postgresRunConfig: configNewPassword,
        username: 'appuser',
        password: 'app-secret',
        database: 'otherdb',
        logger,
      });
      expect(oldPasswordFails).toBe(true);

      const newPasswordWorks = await checkUserCanConnect({
        postgresRunConfig: configNewPassword,
        username: 'appuser',
        password: newPassword,
        database: 'otherdb',
        logger,
      });
      expect(newPasswordWorks).toBe(true);
    },
    30 * 1000
  );

  test(
    'user with multiple databases can connect to each',
    async () => {
      const configMultiDb: PostgresRunConfig = {
        ...baseConfig,
        users: [
          baseConfig.users![0],
          {
            username: 'multiuser',
            password: 'multi-secret',
            databases: ['mydb', 'appdb', 'otherdb'],
          },
        ],
      };
      await setupUsers({
        postgresRunConfig: configMultiDb,
        logger,
      });

      for (const db of ['mydb', 'appdb', 'otherdb']) {
        const ok = await checkUserCanConnect({
          postgresRunConfig: configMultiDb,
          username: 'multiuser',
          password: 'multi-secret',
          database: db,
          logger,
        });
        expect(ok).toBe(true);
      }
    },
    30 * 1000
  );
});
