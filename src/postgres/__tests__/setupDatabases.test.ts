import getPort from 'get-port';
import {Client} from 'pg';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/foreLogger/ConsoleForeLogger.js';
import {
  setupDatabases,
  setupPostgresUsers,
  startPostgresInstance,
} from '../index.js';
import {PostgresRunConfig} from '../postgresRunConfig.js';
import {checkUserCanConnect, cleanupPostgresTest} from './testHelpers.js';

const logger = new ConsoleForeLogger({silent: true});

let baseConfig: PostgresRunConfig;

beforeAll(
  async () => {
    const testPort = await getPort();
    baseConfig = {
      workingDir: process.cwd(),
      port: testPort,
      containerName: `test-pg-setup-dbs-${Date.now()}`,
      volumeName: `test-pg-setup-dbs-${Date.now()}`,
      keep: false,
      authorization: 'enabled',
      ssl: 'disabled',
      postgresVersion: '16',
      users: [{username: 'admin', password: 'admin-db-secret'}],
      dbs: ['defaultdb'],
      discoverability: 'local',
    };

    await startPostgresInstance({
      postgresRunConfig: baseConfig,
      logger,
      waitUntilListening: true,
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

describe('setupDatabases', () => {
  test(
    'creates additional databases from config (skips first which is POSTGRES_DB)',
    async () => {
      const configWithMoreDbs: PostgresRunConfig = {
        ...baseConfig,
        dbs: ['defaultdb', 'extra1', 'extra2'],
      };

      await setupDatabases({
        postgresRunConfig: configWithMoreDbs,
        logger,
      });

      const client = new Client({
        host: '127.0.0.1',
        port: baseConfig.port,
        user: 'admin',
        password: 'admin-db-secret',
        database: 'postgres',
      });
      await client.connect();

      const result = await client.query(
        `SELECT datname FROM pg_database WHERE datname IN ('defaultdb','extra1','extra2') ORDER BY datname`
      );
      await client.end();

      expect(result.rows.map(r => r.datname)).toEqual([
        'defaultdb',
        'extra1',
        'extra2',
      ]);
    },
    30 * 1000
  );

  test(
    'is idempotent - running again does not fail',
    async () => {
      const configWithMoreDbs: PostgresRunConfig = {
        ...baseConfig,
        dbs: ['defaultdb', 'extra1', 'extra2'],
      };

      await setupDatabases({
        postgresRunConfig: configWithMoreDbs,
        logger,
      });

      await setupDatabases({
        postgresRunConfig: configWithMoreDbs,
        logger,
      });

      const ok = await checkUserCanConnect({
        postgresRunConfig: configWithMoreDbs,
        username: 'admin',
        password: 'admin-db-secret',
        database: 'extra1',
        logger,
      });
      expect(ok).toBe(true);
    },
    20 * 1000
  );
});
