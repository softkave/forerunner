import {kill} from 'process';

/**
 * Check if a process exists. Uses `kill(pid, 0)`, which does not send a signal
 * but throws if the process does not exist (ESRCH) or is not accessible (EPERM).
 *
 * Useful before trying to kill a PID from a stale pids file or netstat.
 *
 * Shell equivalents:
 *   - `ps -p <pid>`        → exit 0 if exists, 1 if not
 *   - `kill -0 <pid>`      → exit 0 if exists, 1 if not (POSIX)
 */
export function processExists(pid: number): boolean {
  try {
    kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
