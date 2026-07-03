import {afterAll, describe, expect, test} from 'vitest';
import {
  dockerNetworkExists,
  ensureDockerNetwork,
  removeDockerNetwork,
} from '../docker.js';

const testNetworkName = `forerunner-test-net-${Date.now()}`;

afterAll(async () => {
  await removeDockerNetwork(testNetworkName);
});

describe('docker network helpers', () => {
  test('ensureDockerNetwork creates a bridge network', async () => {
    expect(await dockerNetworkExists(testNetworkName)).toBe(false);

    await ensureDockerNetwork(testNetworkName);

    expect(await dockerNetworkExists(testNetworkName)).toBe(true);
  });

  test('ensureDockerNetwork is idempotent', async () => {
    await ensureDockerNetwork(testNetworkName);
    await ensureDockerNetwork(testNetworkName);

    expect(await dockerNetworkExists(testNetworkName)).toBe(true);
  });

  test('removeDockerNetwork removes an existing network', async () => {
    await ensureDockerNetwork(testNetworkName);
    await removeDockerNetwork(testNetworkName);

    expect(await dockerNetworkExists(testNetworkName)).toBe(false);
  });
});
