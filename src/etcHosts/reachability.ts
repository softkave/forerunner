import net from 'net';

export async function canReachTcpPort(params: {
  host: string;
  port: number;
  timeoutMs?: number;
}): Promise<boolean> {
  const {host, port, timeoutMs = 2_000} = params;

  return new Promise(resolve => {
    const socket = net.connect({host, port});
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);

    const finish = (reachable: boolean) => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(reachable);
    };

    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}
