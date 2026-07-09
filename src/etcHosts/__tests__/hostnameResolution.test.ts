import dns from 'dns/promises';
import {afterEach, describe, expect, test, vi} from 'vitest';
import {parseHostsFile} from '../helpers.js';
import {
  findHostnameInHostsEntries,
  getHostnamesNeedingHostsEntry,
  getUnresolvableHostnames,
  lookupHostnameAddress,
} from '../hostnameResolution.js';
import * as reachability from '../reachability.js';

describe('hostnameResolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('findHostnameInHostsEntries returns matching entry', () => {
    const entries = parseHostsFile({
      content: '127.0.0.1\tmongo-1.dev.local\n',
    });
    expect(
      findHostnameInHostsEntries({hostname: 'mongo-1.dev.local', entries})?.ip
    ).toBe('127.0.0.1');
  });

  test('lookupHostnameAddress resolves localhost without /etc/hosts', async () => {
    await expect(lookupHostnameAddress({hostname: 'localhost'})).resolves.toBe(
      '127.0.0.1'
    );
  });

  test('getUnresolvableHostnames returns hostnames missing from hosts content', async () => {
    vi.spyOn(dns, 'lookup').mockImplementation(async hostname => {
      if (hostname === 'known.dev.local') {
        return {address: '127.0.0.1', family: 4};
      }
      throw Object.assign(new Error('ENOTFOUND'), {code: 'ENOTFOUND'});
    });

    const missing = await getUnresolvableHostnames({
      hostnames: ['known.dev.local', 'missing.dev.local'],
      hostsFilePath: '/does-not-exist-for-test',
    });

    expect(missing).toEqual(['missing.dev.local']);
  });

  test('getHostnamesNeedingHostsEntry skips hostnames that reach the published port', async () => {
    vi.spyOn(reachability, 'canReachTcpPort').mockResolvedValue(true);

    const missing = await getHostnamesNeedingHostsEntry({
      hostnamePorts: [{hostname: 'mongo-1.dev.local', port: 27017}],
      hostsFilePath: '/does-not-exist-for-test',
      targetIp: '127.0.0.1',
    });

    expect(missing).toEqual([]);
  });

  test('getHostnamesNeedingHostsEntry skips when hostname and port are reachable', async () => {
    const hostsFilePath = await (async () => {
      const {mkdtemp, writeFile} = await import('fs/promises');
      const os = await import('os');
      const path = await import('path');
      const dir = await mkdtemp(path.join(os.tmpdir(), 'forerunner-hosts-'));
      await writeFile(
        path.join(dir, 'hosts'),
        '127.0.0.1\tmongo-1.mongo.test\n',
        'utf8'
      );
      return path.join(dir, 'hosts');
    })();

    vi.spyOn(reachability, 'canReachTcpPort').mockResolvedValue(true);

    const missing = await getHostnamesNeedingHostsEntry({
      hostnamePorts: [{hostname: 'mongo-1.mongo.test', port: 27017}],
      hostsFilePath,
      targetIp: '127.0.0.1',
    });

    expect(missing).toEqual([]);
    expect(reachability.canReachTcpPort).toHaveBeenCalledWith({
      host: 'mongo-1.mongo.test',
      port: 27017,
      timeoutMs: 2_000,
    });
  });

  test('getHostnamesNeedingHostsEntry flags unreachable hostnames', async () => {
    vi.spyOn(reachability, 'canReachTcpPort').mockResolvedValue(false);

    const missing = await getHostnamesNeedingHostsEntry({
      hostnamePorts: [{hostname: 'mongo-1.mongo.test', port: 27017}],
      hostsFilePath: '/does-not-exist-for-test',
      targetIp: '127.0.0.1',
    });

    expect(missing).toEqual(['mongo-1.mongo.test']);
  });

  test('getHostnamesNeedingHostsEntry accepts LAN IP when port is reachable', async () => {
    vi.spyOn(reachability, 'canReachTcpPort').mockResolvedValue(true);
    vi.spyOn(dns, 'lookup').mockResolvedValue({
      address: '192.168.1.42',
      family: 4,
    });

    const missing = await getHostnamesNeedingHostsEntry({
      hostnamePorts: [{hostname: 'mongo-1.dev.local', port: 27017}],
      hostsFilePath: '/does-not-exist-for-test',
      targetIp: '127.0.0.1',
    });

    expect(missing).toEqual([]);
  });
});
