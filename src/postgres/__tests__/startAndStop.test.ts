import fs from 'fs';
import getPort from 'get-port';
import os from 'os';
import path from 'path';
import {afterAll, describe, expect, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/foreLogger/ConsoleForeLogger.js';
import {
  startPostgresInstance,
  stopPostgresInstance,
  waitForPostgresReady,
} from '../index.js';
import {
  PostgresRunConfig,
  postgresRunConfigSchema,
} from '../postgresRunConfig.js';
import {
  checkUserCanConnect,
  cleanupPostgresTest,
  waitUntilContainerStopped,
} from './testHelpers.js';

const logger = new ConsoleForeLogger({silent: true});

const POSTGRES_VERSIONS = ['16', '17', '18'] as const;

/** Configs created by tests; afterAll cleans containers and volumes even if a test fails. */
const configsToCleanup: PostgresRunConfig[] = [];

afterAll(async () => {
  for (const config of configsToCleanup) {
    await cleanupPostgresTest({
      postgresRunConfig: config,
      removeVolume: true,
    });
  }
});

describe.each(POSTGRES_VERSIONS)(
  'startPostgresInstance and stopPostgresInstance (postgres %s)',
  postgresVersion => {
    test(
      'starts with authorization disabled (trust) and no users',
      async () => {
        const port = await getPort();
        const containerName = `test-pg-trust-${postgresVersion}-${Date.now()}`;
        const config = postgresRunConfigSchema.parse({
          port,
          containerName,
          postgresVersion,
          authorization: 'disabled',
          dbs: ['mydb'],
        }) as PostgresRunConfig;
        configsToCleanup.push(config);

        await startPostgresInstance({
          postgresRunConfig: config,
          logger,
          waitUntilListening: true,
        });

        const postgresTrust = await checkUserCanConnect({
          postgresRunConfig: config,
          username: 'postgres',
          password: '',
          database: 'mydb',
          logger,
        });
        expect(postgresTrust).toBe(true);

        await cleanupPostgresTest({postgresRunConfig: config});
        await waitUntilContainerStopped(containerName);
      },
      2 * 60 * 1000
    );

    test(
      'starts with authorization enabled and admin user',
      async () => {
        const port = await getPort();
        const containerName = `test-pg-auth-${postgresVersion}-${Date.now()}`;
        const config = postgresRunConfigSchema.parse({
          port,
          containerName,
          postgresVersion,
          authorization: 'enabled',
          users: [{username: 'admin', password: 'admin-pw'}],
          dbs: ['mydb'],
        }) as PostgresRunConfig;
        configsToCleanup.push(config);

        await startPostgresInstance({
          postgresRunConfig: config,
          logger,
          waitUntilListening: true,
        });

        let adminOk = false;
        for (let i = 0; i < 5; i++) {
          adminOk = await checkUserCanConnect({
            postgresRunConfig: config,
            username: 'admin',
            password: 'admin-pw',
            database: 'mydb',
            logger,
          });
          if (adminOk) break;
          await new Promise(r => setTimeout(r, 1000));
        }
        expect(adminOk).toBe(true);

        const noPasswordFails = await checkUserCanConnect({
          postgresRunConfig: config,
          username: 'admin',
          password: '',
          database: 'mydb',
          logger,
        });
        expect(noPasswordFails).toBe(false);

        await cleanupPostgresTest({postgresRunConfig: config});
        await waitUntilContainerStopped(containerName);
      },
      2 * 60 * 1000
    );

    test(
      'starts with SSL enabled and client can connect over SSL',
      async () => {
        const port = await getPort();
        const containerName = `test-pg-ssl-${postgresVersion}-${Date.now()}`;
        const workingDir = await fs.promises.mkdtemp(
          path.join(os.tmpdir(), 'forerunner-pg-ssl-')
        );
        try {
          const config = postgresRunConfigSchema.parse({
            port,
            containerName,
            postgresVersion,
            workingDir,
            authorization: 'enabled',
            ssl: 'enabled',
            caConfig: {
              outDir: path.join(workingDir, 'postgres-certs-out'),
              days: 365,
              subject: {
                C: 'US',
                ST: 'CA',
                L: 'SF',
                O: 'Test',
                CN: 'Postgres Test CA',
              },
              files: {
                key: 'ca.key.pem',
                cert: 'ca.crt.pem',
                csr: 'ca.csr.pem',
                chain: 'ca-chain.pem',
              },
              // Empty passphrase = unencrypted CA key so openssl works in
              // non-interactive test env
              passphrase: '',
            },
            users: [{username: 'ssluser', password: 'ssl-secret'}],
            dbs: ['mydb'],
          }) as PostgresRunConfig;
          configsToCleanup.push(config);

          await startPostgresInstance({
            postgresRunConfig: config,
            logger,
            waitUntilListening: true,
          });

          let sslOk = false;
          for (let i = 0; i < 5; i++) {
            sslOk = await checkUserCanConnect({
              postgresRunConfig: config,
              username: 'ssluser',
              password: 'ssl-secret',
              database: 'mydb',
              logger,
            });
            if (sslOk) break;
            await new Promise(r => setTimeout(r, 1000));
          }
          expect(sslOk).toBe(true);

          await cleanupPostgresTest({postgresRunConfig: config});
          await waitUntilContainerStopped(containerName);
        } finally {
          await fs.promises.rm(workingDir, {recursive: true, force: true});
        }
      },
      2 * 60 * 1000
    );

    test(
      'stopPostgresInstance removes container and volume when removeVolume true',
      async () => {
        const port = await getPort();
        const containerName = `test-pg-stop-${postgresVersion}-${Date.now()}`;
        const config = postgresRunConfigSchema.parse({
          port,
          containerName,
          postgresVersion,
          keep: false,
          authorization: 'disabled',
          dbs: ['mydb'],
        }) as PostgresRunConfig;
        configsToCleanup.push(config);

        await startPostgresInstance({
          postgresRunConfig: config,
          logger,
          waitUntilListening: true,
        });

        await stopPostgresInstance({
          containerName: config.containerName,
          postgresRunConfig: config,
          logger,
          removeVolume: true,
        });

        await waitUntilContainerStopped(containerName);
      },
      2 * 60 * 1000
    );
  }
);

describe.each(POSTGRES_VERSIONS)(
  'waitForPostgresReady (postgres %s)',
  postgresVersion => {
    test(
      'resolves when postgres is accepting connections',
      async () => {
        const port = await getPort();
        const containerName = `test-pg-wait-${postgresVersion}-${Date.now()}`;
        const config = postgresRunConfigSchema.parse({
          port,
          containerName,
          postgresVersion,
          authorization: 'disabled',
          dbs: ['mydb'],
        }) as PostgresRunConfig;
        configsToCleanup.push(config);

        await startPostgresInstance({
          postgresRunConfig: config,
          logger,
          waitUntilListening: false,
        });

        await waitForPostgresReady({
          postgresRunConfig: config,
          containerName: config.containerName,
          port: config.port,
          sslEnabled: false,
          logger,
          maxAttempts: 30,
          retryIntervalMs: 500,
        });

        await cleanupPostgresTest({postgresRunConfig: config});
      },
      2 * 60 * 1000
    );
  }
);
