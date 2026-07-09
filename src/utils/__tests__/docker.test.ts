import {afterAll, describe, expect, test} from 'vitest';
import {
  dockerNetworkExists,
  ensureDockerNetwork,
  getDockerInstallMessage,
  removeDockerNetwork,
} from '../docker.js';

const testNetworkName = `forerunner-test-net-${Date.now()}`;

afterAll(async () => {
  await removeDockerNetwork(testNetworkName);
});

describe('getDockerInstallMessage', () => {
  test('returns a docs.docker.com install link for the current platform', () => {
    const message = getDockerInstallMessage();

    expect(message).toContain('https://docs.docker.com/');

    if (process.platform === 'darwin') {
      expect(message).toContain('mac-install');
    } else if (process.platform === 'win32') {
      expect(message).toContain('windows-install');
    } else if (process.platform === 'linux') {
      expect(message).toContain('engine/install');
    } else {
      expect(message).toContain('get-docker');
    }
  });
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
