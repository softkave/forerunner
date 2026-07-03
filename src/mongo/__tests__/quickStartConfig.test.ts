import {describe, expect, test} from 'vitest';
import {extractHostnames} from '../mongoRunConfig.js';
import {
  buildQuickMongoRunConfig,
  buildQuickMongoStopConfig,
  getDefaultDevHostname,
  getDefaultMongoDockerNetworkName,
  getQuickStartContainerHostname,
  parseMongoCliPorts,
} from '../quickStartConfig.js';

describe('quickStartConfig', () => {
  test('getDefaultMongoDockerNetworkName derives from container name', () => {
    expect(getDefaultMongoDockerNetworkName('my-mongo')).toBe('my-mongo-net');
  });

  test('getQuickStartContainerHostname matches docker container naming', () => {
    expect(getQuickStartContainerHostname('my-mongo', 1)).toBe(
      'my-mongo-mongod-1'
    );
    expect(getQuickStartContainerHostname('my-mongo', 3)).toBe(
      'my-mongo-mongod-3'
    );
  });

  test('parseMongoCliPorts parses at least three ports', () => {
    expect(parseMongoCliPorts(['27017', '27018', '27019'])).toEqual([
      27017, 27018, 27019,
    ]);
  });

  test('parseMongoCliPorts rejects fewer than three ports', () => {
    expect(() => parseMongoCliPorts(['27017', '27018'])).toThrow(
      'At least 3 ports are required'
    );
  });

  test('getDefaultDevHostname is stable for the same container name', () => {
    expect(getDefaultDevHostname('my-mongo', 1)).toBe(
      'my-mongo-mongod-1.dev.local'
    );
    expect(getDefaultDevHostname('my-mongo', 1)).toBe(
      'my-mongo-mongod-1.dev.local'
    );
  });

  test('buildQuickMongoRunConfig uses stable dev.local hostnames with local resolution', () => {
    const config = buildQuickMongoRunConfig({
      containerName: 'dev-mongo',
      ports: [27100, 27101, 27102],
      workingDir: '/tmp/dev-mongo',
      replicaSetName: 'dev-rs',
    });

    expect(config.containerName).toBe('dev-mongo');
    expect(config.dockerNetwork).toBe('dev-mongo-net');
    expect(config.replicaSetName).toBe('dev-rs');
    expect(config.ports).toEqual([27100, 27101, 27102]);
    expect(config.authorization).toBe('disabled');
    expect(config.users).toEqual([]);

    const instanceOneHostnames = extractHostnames(config.hostnames[0]);
    expect(instanceOneHostnames).toContain('dev-mongo-mongod-1.dev.local');
    expect(instanceOneHostnames).toContain('localhost');

    const instanceThreeHostnames = extractHostnames(config.hostnames[2]);
    expect(instanceThreeHostnames).toContain('dev-mongo-mongod-3.dev.local');
  });

  test('buildQuickMongoRunConfig accepts custom hostnames', () => {
    const config = buildQuickMongoRunConfig({
      containerName: 'custom-mongo',
      ports: [27100, 27101, 27102],
      hostnames: ['mongo-a.local', 'mongo-b.local', 'mongo-c.local'],
    });

    expect(extractHostnames(config.hostnames[0])).toContain('mongo-a.local');
    expect(extractHostnames(config.hostnames[2])).toContain('mongo-c.local');
  });

  test('buildQuickMongoRunConfig enables auth when user and password provided', () => {
    const config = buildQuickMongoRunConfig({
      containerName: 'auth-mongo',
      ports: [27200, 27201, 27202],
      workingDir: '/tmp/auth-mongo',
      user: 'admin',
      password: 'secret',
    });

    expect(config.authorization).toBe('enabled');
    expect(config.users).toHaveLength(2);
    expect(config.users[0]?.username).toBe('admin');
    expect(config.users[1]?.username).toBe('cluster-admin');
    expect(config.users[1]?.password).toBe('secret');
  });

  test('buildQuickMongoStopConfig builds minimal config for stop', () => {
    const config = buildQuickMongoStopConfig({
      containerName: 'stop-mongo',
      ports: [27300, 27301, 27302],
      workingDir: '/tmp/stop-mongo',
    });

    expect(config.containerName).toBe('stop-mongo');
    expect(config.dockerNetwork).toBe('stop-mongo-net');
    expect(config.replicaSetName).toBe('stop-mongo-rs');
  });
});
