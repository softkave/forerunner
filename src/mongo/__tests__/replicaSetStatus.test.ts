import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/exports.js';
import {generateMongoPassword, setupReplicaSetMain} from '../index.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {
  getReplicaSetStatus,
  kMemberHealthStr,
  kMemberReplicaSetStatesStr,
} from '../replicaSetStatus.js';
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
  ports: [27060, 27061, 27062],
  users: [
    {
      username: 'test-status-admin',
      roles: [{role: 'userAdminAnyDatabase', db: 'admin'}],
      password: generateMongoPassword(),
    },
    {
      username: 'test-status-cluster-admin',
      roles: [{role: 'clusterAdmin', db: 'admin'}],
      password: generateMongoPassword(),
    },
  ],
  workingDir: 'testdir/mongo/test-replica-set-status',
  mongoVersion: '8.2.3',
  replicaSetName: 'test-replica-set-status',
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

describe('replica set status constants', () => {
  test('kMemberReplicaSetStatesStr includes PRIMARY and SECONDARY', () => {
    expect(kMemberReplicaSetStatesStr.PRIMARY).toBe('PRIMARY');
    expect(kMemberReplicaSetStatesStr.SECONDARY).toBe('SECONDARY');
  });

  test('kMemberHealthStr includes HEALTHY and UNHEALTHY', () => {
    expect(kMemberHealthStr.HEALTHY).toBe('HEALTHY');
    expect(kMemberHealthStr.UNHEALTHY).toBe('UNHEALTHY');
  });
});

describe('getReplicaSetStatus', () => {
  test(
    'returns status with set name, date, and members when ping is repl',
    async () => {
      const status = await getReplicaSetStatus({
        mongoRunConfig,
        logger,
        ping: 'repl',
      });

      expect(status.set).toBe(mongoRunConfig.replicaSetName);
      expect(status.date).toBeDefined();
      expect(status.members).toBeDefined();
      expect(Array.isArray(status.members)).toBe(true);
      expect(status.members.length).toBeGreaterThanOrEqual(1);

      const primary = status.members.find(m => m.stateStr === 'PRIMARY');
      expect(primary).toBeDefined();
      expect(primary!.health).toBe('HEALTHY');

      for (const member of status.members) {
        expect(member.name).toBeDefined();
        expect(member.state).toBeDefined();
        expect(member.stateStr).toBeDefined();
        expect(member.health).toBeDefined();
      }
    },
    1 * 60 * 1000 // 1 minute
  );

  test(
    'returns status when ping is instance number',
    async () => {
      const status = await getReplicaSetStatus({
        mongoRunConfig,
        logger,
        ping: 1,
      });

      expect(status.set).toBe(mongoRunConfig.replicaSetName);
      expect(status.members.length).toBeGreaterThanOrEqual(1);
    },
    1 * 60 * 1000 // 1 minute
  );

  test(
    'returns status with all members when ping is all',
    async () => {
      const status = await getReplicaSetStatus({
        mongoRunConfig,
        logger,
        ping: 'all',
      });

      expect(status.set).toBe(mongoRunConfig.replicaSetName);
      expect(status.members.length).toBe(mongoRunConfig.ports.length);
      expect(status.rawAll).toBeDefined();
      expect(status.rawAll.length).toBe(mongoRunConfig.ports.length);
    },
    1 * 60 * 1000 // 1 minute
  );

  test(
    'printStatus logs to logger when printStatus is true',
    async () => {
      const status = await getReplicaSetStatus({
        mongoRunConfig,
        logger,
        ping: 'repl',
        printStatus: true,
      });

      expect(status.set).toBe(mongoRunConfig.replicaSetName);
      expect(status.members.length).toBeGreaterThanOrEqual(1);
    },
    1 * 60 * 1000 // 1 minute
  );
});
