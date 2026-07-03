import net from 'net';
import {afterEach, describe, expect, test} from 'vitest';
import {canReachTcpPort} from '../reachability.js';

describe('reachability', () => {
  let server: net.Server | undefined;

  afterEach(async () => {
    await new Promise<void>(resolve => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
    server = undefined;
  });

  test('canReachTcpPort returns true when port accepts connections', async () => {
    server = net.createServer();
    await new Promise<void>(resolve => {
      server!.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as net.AddressInfo).port;

    await expect(
      canReachTcpPort({host: '127.0.0.1', port, timeoutMs: 2_000})
    ).resolves.toBe(true);
  });

  test('canReachTcpPort returns false when nothing listens', async () => {
    await expect(
      canReachTcpPort({host: '127.0.0.1', port: 1, timeoutMs: 200})
    ).resolves.toBe(false);
  });
});
