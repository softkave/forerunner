import {describe, expect, test} from 'vitest';
import {ConsoleForeLogger} from '../../utils/exports.js';
import {generateMongoPassword, printMongoUriMain} from '../index.js';
import {MongoRunConfig} from '../mongoRunConfig.js';

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
  ports: [27050, 27051, 27052],
  users: [
    {
      username: 'test-uri-admin',
      roles: [{role: 'userAdminAnyDatabase', db: 'admin'}],
      password: generateMongoPassword(),
    },
  ],
  workingDir: 'testdir/mongo/test-print-mongo-uri',
  bindLocalhost: true,
  mongoVersion: '8.2.3',
  replicaSetName: 'test-print-mongo-uri',
  authorization: 'enabled',
};

const logger = new ConsoleForeLogger({silent: true});

describe('printMongoUri', () => {
  test('returns replica set URI with hosts and replicaSet param when connectionType is replicaSet', async () => {
    const uri = await printMongoUriMain({
      mongoRunConfig,
      logger,
      connectionType: 'replicaSet',
    });

    expect(uri).toMatch(/^mongodb:\/\//);
    expect(uri).toContain(`replicaSet=${mongoRunConfig.replicaSetName}`);
    expect(uri).toContain('serverSelectionTimeoutMs=');
    expect(uri).toContain('27050');
    expect(uri).toContain('27051');
    expect(uri).toContain('27052');
  });

  test('returns replica set URI with credentials when username and password provided', async () => {
    const username = 'test-uri-admin';
    const password = mongoRunConfig.users![0].password;
    const uri = await printMongoUriMain({
      mongoRunConfig,
      logger,
      connectionType: 'replicaSet',
      username,
      password,
    });

    expect(uri).toMatch(/^mongodb:\/\/[^:]+:[^@]+@/);
    expect(uri).toContain(encodeURIComponent(username));
    expect(uri).toContain(encodeURIComponent(password));
  });

  test('uses password from mongoRunConfig.users when username matches and password not provided', async () => {
    const username = 'test-uri-admin';
    const uri = await printMongoUriMain({
      mongoRunConfig,
      logger,
      connectionType: 'replicaSet',
      username,
    });

    expect(uri).toMatch(/^mongodb:\/\/[^:]+:[^@]+@/);
    expect(uri).toContain(encodeURIComponent(username));
  });

  test('returns instance URI for single instance when connectionType is instance', async () => {
    const uri = await printMongoUriMain({
      mongoRunConfig,
      logger,
      connectionType: 'instance',
      instanceNumber: 1,
    });

    expect(uri).toMatch(/^mongodb:\/\//);
    expect(uri).toContain('27050');
    expect(uri).not.toContain('replicaSet=');
  });

  test('returns instance URI for given instanceNumber', async () => {
    const uri = await printMongoUriMain({
      mongoRunConfig,
      logger,
      connectionType: 'instance',
      instanceNumber: 2,
    });

    expect(uri).toContain('27051');
  });

  test('replica set URI with preferLocalhost uses localhost in host list', async () => {
    const uri = await printMongoUriMain({
      mongoRunConfig,
      logger,
      connectionType: 'replicaSet',
      preferLocalhost: true,
    });

    expect(uri).toMatch(/localhost|127\.0\.0\.1/);
    expect(uri).toContain(`replicaSet=${mongoRunConfig.replicaSetName}`);
  });
});
