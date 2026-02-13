import {exec} from 'child_process';
import {platform} from 'os';

/**
 * Get PIDs of processes that have the given ports open, using `lsof`.
 * Only returns live processes; avoids stale PIDs from netstat's TCP state.
 *
 * Supported on darwin and linux. Returns [] on other platforms or if lsof
 * is unavailable / fails.
 *
 * Shell equivalent to inspect what is using a port:
 *   lsof -i :<port>        # full lines
 *   lsof -i :<port> -t     # PIDs only
 *   lsof -iTCP:<port> -sTCP:LISTEN  # only listeners
 */
export async function getPIDsByPortLsof(ports: number[]): Promise<number[]> {
  if (ports.length === 0) return [];

  const pl = platform();
  if (pl !== 'darwin' && pl !== 'linux') return [];

  const portArgs = ports.map(port => `-i :${port}`).join(' ');
  const cmd = `lsof ${portArgs} -t 2>/dev/null`;

  return new Promise(resolve => {
    exec(cmd, {encoding: 'utf8'}, (err, stdout) => {
      if (err) {
        resolve([]);
        return;
      }
      const pids = stdout
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(s => parseInt(s, 10))
        .filter(n => !isNaN(n));
      resolve([...new Set(pids)]);
    });
  });
}
