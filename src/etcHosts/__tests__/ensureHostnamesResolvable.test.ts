import {mkdtemp, readFile, rm, writeFile} from 'fs/promises';
import os from 'os';
import path from 'path';
import {afterEach, describe, expect, test, vi} from 'vitest';
import {ConsoleForeLogger} from '../../utils/foreLogger/ConsoleForeLogger.js';
import {ensureHostnamesResolvable} from '../ensureHostnamesResolvable.js';
import * as hostnameResolution from '../hostnameResolution.js';

const logger = new ConsoleForeLogger({silent: true});
const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const dir of tempDirs) {
    await rm(dir, {recursive: true, force: true});
  }
  tempDirs.length = 0;
});

async function createTempHostsFile(initialContent = ''): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'forerunner-hosts-'));
  tempDirs.push(dir);
  const hostsPath = path.join(dir, 'hosts');
  await writeFile(hostsPath, initialContent, 'utf8');
  return hostsPath;
}

describe('ensureHostnamesResolvable', () => {
  test('mode skip continues without writing hosts file', async () => {
    const lookupSpy = vi
      .spyOn(hostnameResolution, 'getUnresolvableHostnames')
      .mockResolvedValue(['mongo-1.dev.local']);

    await ensureHostnamesResolvable({
      hostnames: ['mongo-1.dev.local'],
      mode: 'skip',
      logger,
    });

    expect(lookupSpy).toHaveBeenCalled();
  });

  test('mode manual throws with instructions', async () => {
    vi.spyOn(hostnameResolution, 'getUnresolvableHostnames').mockResolvedValue([
      'mongo-1.dev.local',
      'mongo-2.dev.local',
    ]);

    await expect(
      ensureHostnamesResolvable({
        hostnames: ['mongo-1.dev.local', 'mongo-2.dev.local'],
        mode: 'manual',
        ip: '127.0.0.1',
        logger,
      })
    ).rejects.toThrow('Add the following lines to /etc/hosts');
  });

  test('mode add writes missing hostnames to hosts file', async () => {
    const hostsFilePath = await createTempHostsFile('127.0.0.1\tlocalhost\n');
    vi.spyOn(hostnameResolution, 'getUnresolvableHostnames')
      .mockResolvedValueOnce(['mongo-1.dev.local'])
      .mockResolvedValueOnce([]);

    await ensureHostnamesResolvable({
      hostnames: ['mongo-1.dev.local'],
      mode: 'add',
      ip: '127.0.0.1',
      hostsFilePath,
      logger,
    });

    const content = await readFile(hostsFilePath, 'utf8');
    expect(content).toContain('mongo-1.dev.local');
  });

  test('mode add skips write when entries already have the target IP', async () => {
    const hostsFilePath = await createTempHostsFile(
      '127.0.0.1\tmongo-1.dev.local\n'
    );
    vi.spyOn(hostnameResolution, 'getUnresolvableHostnames')
      .mockResolvedValueOnce(['mongo-1.dev.local'])
      .mockResolvedValueOnce([]);

    const before = await readFile(hostsFilePath, 'utf8');

    await ensureHostnamesResolvable({
      hostnames: ['mongo-1.dev.local'],
      mode: 'add',
      ip: '127.0.0.1',
      hostsFilePath,
      logger,
    });

    const after = await readFile(hostsFilePath, 'utf8');
    expect(after).toBe(before);
  });
});
