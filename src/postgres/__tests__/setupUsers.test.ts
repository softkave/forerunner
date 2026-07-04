import getPort from 'get-port';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/foreLogger/ConsoleForeLogger.js';
import {
  setupDatabases,
  setupPostgresUsers,
  startPostgresInstance,
} from '../index.js';
import {PostgresRunConfig} from '../postgresRunConfig.js';
import {
  checkUserCanConnect,
  checkUserCannotConnect,
  cleanupPostgresTest,
  runSqlAsUser,
} from './testHelpers.js';

const logger = new ConsoleForeLogger({silent: true});

const POSTGRES_VERSIONS = ['16', '17', '18'] as const;

describe.each(POSTGRES_VERSIONS)(
  'setupUsers (postgres %s)',
  postgresVersion => {
    let testPort: number;
    let baseConfig: PostgresRunConfig;

    beforeAll(
      async () => {
        testPort = await getPort();
        baseConfig = {
          workingDir: process.cwd(),
          port: testPort,
          containerName: `test-pg-setup-users-${postgresVersion}-${Date.now()}`,
          volumeName: `test-pg-setup-users-${postgresVersion}-${Date.now()}`,
          keep: false,
          authorization: 'enabled',
          ssl: 'disabled',
          postgresVersion,
          users: [{username: 'admin', password: 'admin-secret'}],
          dbs: ['mydb', 'appdb', 'otherdb'],
          discoverability: 'local',
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

        await setupPostgresUsers({
          postgresRunConfig: baseConfig,
          logger,
        });
      },
      2 * 60 * 1000
    );

    afterAll(async () => {
      await cleanupPostgresTest({
        postgresRunConfig: baseConfig,
        removeVolume: true,
      });
    });

    describe('user and access management', () => {
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
          await setupPostgresUsers({
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
        'user can create and manage schemas in wildcard-granted databases',
        async () => {
          const configWithSchemaUser: PostgresRunConfig = {
            ...baseConfig,
            users: [
              ...baseConfig.users!,
              {
                username: 'schemauser',
                password: 'schema-secret',
                databases: ['*'],
              },
            ],
          };
          await setupPostgresUsers({
            postgresRunConfig: configWithSchemaUser,
            logger,
          });

          const schemaName = 'schemauser_test';
          const renamedSchemaName = 'schemauser_test_renamed';

          await runSqlAsUser({
            postgresRunConfig: configWithSchemaUser,
            username: 'schemauser',
            password: 'schema-secret',
            database: 'appdb',
            query: `CREATE SCHEMA ${schemaName}`,
          });
          await runSqlAsUser({
            postgresRunConfig: configWithSchemaUser,
            username: 'schemauser',
            password: 'schema-secret',
            database: 'appdb',
            query: `CREATE TABLE ${schemaName}.demo (id integer primary key, value text)`,
          });
          await runSqlAsUser({
            postgresRunConfig: configWithSchemaUser,
            username: 'schemauser',
            password: 'schema-secret',
            database: 'appdb',
            query: `INSERT INTO ${schemaName}.demo (id, value) VALUES (1, 'hello')`,
          });

          const selectResult = await runSqlAsUser({
            postgresRunConfig: configWithSchemaUser,
            username: 'schemauser',
            password: 'schema-secret',
            database: 'appdb',
            query: `SELECT value FROM ${schemaName}.demo WHERE id = 1`,
          });
          expect(selectResult.rows[0]?.value).toBe('hello');

          await runSqlAsUser({
            postgresRunConfig: configWithSchemaUser,
            username: 'schemauser',
            password: 'schema-secret',
            database: 'appdb',
            query: `UPDATE ${schemaName}.demo SET value = 'updated' WHERE id = 1`,
          });

          const updatedResult = await runSqlAsUser({
            postgresRunConfig: configWithSchemaUser,
            username: 'schemauser',
            password: 'schema-secret',
            database: 'appdb',
            query: `SELECT value FROM ${schemaName}.demo WHERE id = 1`,
          });
          expect(updatedResult.rows[0]?.value).toBe('updated');

          await runSqlAsUser({
            postgresRunConfig: configWithSchemaUser,
            username: 'schemauser',
            password: 'schema-secret',
            database: 'appdb',
            query: `ALTER SCHEMA ${schemaName} RENAME TO ${renamedSchemaName}`,
          });

          const renamedResult = await runSqlAsUser({
            postgresRunConfig: configWithSchemaUser,
            username: 'schemauser',
            password: 'schema-secret',
            database: 'appdb',
            query: `SELECT value FROM ${renamedSchemaName}.demo WHERE id = 1`,
          });
          expect(renamedResult.rows[0]?.value).toBe('updated');

          await runSqlAsUser({
            postgresRunConfig: configWithSchemaUser,
            username: 'schemauser',
            password: 'schema-secret',
            database: 'appdb',
            query: `DROP SCHEMA ${renamedSchemaName} CASCADE`,
          });

          const droppedSchema = await runSqlAsUser({
            postgresRunConfig: configWithSchemaUser,
            username: 'schemauser',
            password: 'schema-secret',
            database: 'appdb',
            query: `SELECT 1 FROM information_schema.schemata WHERE schema_name = '${renamedSchemaName}'`,
          });
          expect(droppedSchema.rows).toHaveLength(0);
        },
        60 * 1000
      );

      test(
        'setupDatabases grants access to users with explicit database access',
        async () => {
          const configWithExplicitAccess: PostgresRunConfig = {
            ...baseConfig,
            dbs: [...(baseConfig.dbs ?? []), 'newdb'],
            users: [
              ...baseConfig.users!,
              {
                username: 'explicituser',
                password: 'explicit-secret',
                databases: ['newdb'],
              },
            ],
          };

          await setupDatabases({
            postgresRunConfig: configWithExplicitAccess,
            logger,
          });
          await setupPostgresUsers({
            postgresRunConfig: configWithExplicitAccess,
            logger,
          });

          const canConnectNewDb = await checkUserCanConnect({
            postgresRunConfig: configWithExplicitAccess,
            username: 'explicituser',
            password: 'explicit-secret',
            database: 'newdb',
            logger,
          });
          expect(canConnectNewDb).toBe(true);

          const cannotConnectOtherDb = await checkUserCannotConnect({
            postgresRunConfig: configWithExplicitAccess,
            username: 'explicituser',
            password: 'explicit-secret',
            database: 'otherdb',
            logger,
          });
          expect(cannotConnectOtherDb).toBe(true);
        },
        60 * 1000
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
          await setupPostgresUsers({
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
          await setupPostgresUsers({
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
          await setupPostgresUsers({
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
  }
);
