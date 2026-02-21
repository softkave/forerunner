import {execFileSync} from 'child_process';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/exports.js';
import {
  assertMongoInstancesListening,
  generateMongoPassword,
} from '../index.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {getDockerContainerName, startMongoMain} from '../startMongo.js';
import {
  checkAdminCanConnect,
  checkTestDbUserCanConnect,
  cleanupMongoTest,
} from '../testHelpers.js';

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
  hostnames: [
    'test-1.softkave-forerunner-mongo.fimidara.com',
    'test-2.softkave-forerunner-mongo.fimidara.com',
    {
      hostname: 'test-3.softkave-forerunner-mongo.fimidara.com',
      resolution: 'local',
    },
  ],
  ports: [27030, 27031, 27032],
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

describe('getDockerContainerName', () => {
  const baseConfig: MongoRunConfig = {
    workingDir: '/some/working/dir',
    caConfig: {
      days: 3650,
      subject: {
        C: 'US',
        ST: 'Delaware',
        L: 'Dover',
        O: 'Test',
        CN: 'Test CA',
      },
    },
    hostnames: ['h1', 'h2', 'h3'],
    ports: [27017, 27018, 27019],
    replicaSetName: 'rs0',
    users: [],
  };

  test('returns containerName-based name when containerName is set', () => {
    const config: MongoRunConfig = {...baseConfig, containerName: 'my-mongo'};
    expect(getDockerContainerName(config, 1)).toBe('my-mongo-mongod-1');
    expect(getDockerContainerName(config, 2)).toBe('my-mongo-mongod-2');
    expect(getDockerContainerName(config, 3)).toBe('my-mongo-mongod-3');
  });

  test('returns hash-based name when containerName is not set', () => {
    const config: MongoRunConfig = {...baseConfig};
    delete (config as Partial<MongoRunConfig>).containerName;
    const name1 = getDockerContainerName(config, 1);
    const name2 = getDockerContainerName(config, 2);
    expect(name1).toMatch(/^mongo-[a-f0-9]{12}-mongod-1$/);
    expect(name2).toMatch(/^mongo-[a-f0-9]{12}-mongod-2$/);
    expect(name1).not.toBe(name2);
  });

  test('same workingDir produces same hash prefix for hash-based names', () => {
    const config: MongoRunConfig = {...baseConfig};
    delete (config as Partial<MongoRunConfig>).containerName;
    const run1 = getDockerContainerName(config, 1);
    const run2 = getDockerContainerName(config, 1);
    expect(run1).toBe(run2);
  });

  test('different workingDir produces different hash prefix', () => {
    const configA: MongoRunConfig = {...baseConfig, workingDir: '/path/a'};
    const configB: MongoRunConfig = {...baseConfig, workingDir: '/path/b'};
    delete (configA as Partial<MongoRunConfig>).containerName;
    delete (configB as Partial<MongoRunConfig>).containerName;
    const nameA = getDockerContainerName(configA, 1);
    const nameB = getDockerContainerName(configB, 1);
    expect(nameA).not.toBe(nameB);
    expect(nameA).toMatch(/^mongo-[a-f0-9]{12}-mongod-1$/);
    expect(nameB).toMatch(/^mongo-[a-f0-9]{12}-mongod-1$/);
  });
});

describe('startMongo', () => {
  test(
    'should start mongod instances and setup replica set',
    async () => {
      await startMongoMain({
        mongoRunConfig,
        logger: new ConsoleForeLogger(),
        waitUntilListening: true,
        shouldSetupReplicaSet: true,
      });
      await assertMongoInstancesListening({
        mongoRunConfig,
        logger,
        preferLocalhost: false,
      });
    },
    2 * 60 * 1000 // 2 minutes
  );

  test(
    'second start when already running completes without error (reuses running containers)',
    async () => {
      await startMongoMain({
        mongoRunConfig,
        logger: new ConsoleForeLogger({silent: true}),
        waitUntilListening: false,
        shouldSetupReplicaSet: false, // Skip replica set setup for this test
      });
      await assertMongoInstancesListening({
        mongoRunConfig,
        logger,
        preferLocalhost: false,
      });
    },
    2 * 60 * 1000 // 2 minutes
  );

  test(
    'start after docker stop (without rm) reuses stopped containers',
    async () => {
      const silentLogger = new ConsoleForeLogger({silent: true});
      for (let i = 1; i <= mongoRunConfig.ports.length; i++) {
        const name = getDockerContainerName(mongoRunConfig, i);
        execFileSync('docker', ['stop', name], {
          stdio: 'pipe',
          encoding: 'utf8',
        });
      }
      await startMongoMain({
        mongoRunConfig,
        logger: silentLogger,
        waitUntilListening: true,
        shouldSetupReplicaSet: false, // Skip replica set setup for this test
      });
      await assertMongoInstancesListening({
        mongoRunConfig,
        logger,
        preferLocalhost: false,
      });
    },
    2 * 60 * 1000 // 2 minutes
  );

  test(
    'when config changes (e.g. ports), existing containers are removed and recreated',
    async () => {
      const newPorts = [27033, 27034, 27035] as const;
      const mongoRunConfigNewPorts: MongoRunConfig = {
        ...mongoRunConfig,
        ports: [...newPorts],
      };
      await startMongoMain({
        mongoRunConfig: mongoRunConfigNewPorts,
        logger: new ConsoleForeLogger({silent: true}),
        waitUntilListening: true,
        waitUntilReplicaSetReady: false,
        shouldSetupReplicaSet: false, // Skip replica set setup for this test
      });
      await assertMongoInstancesListening({
        mongoRunConfig: mongoRunConfigNewPorts,
        logger,
        preferLocalhost: false,
      });
    },
    2 * 60 * 1000 // 2 minutes
  );

  test(
    'should setup replica set and users',
    async () => {
      await startMongoMain({
        mongoRunConfig,
        logger,
        waitUntilListening: true,
        shouldSetupReplicaSet: true,
        shouldSetupUsers: true,
      });
      await checkAdminCanConnect({mongoRunConfig, logger});
      await checkTestDbUserCanConnect({
        mongoRunConfig,
        logger,
        username: 'test-user-db',
      });
    },
    2 * 60 * 1000 // 2 minutes
  );
});
