import {defaultTo, uniq} from 'lodash-es';
import {kill} from 'process';
import {AnyObject, waitTimeout} from 'softkave-js-utils';
import find, {FindFunction} from '../findProcess/index.js';
import {IRunnerOpts} from '../process/types.js';
import {findChildrenPIDs} from './findChildrenPIDs.js';
import {getPIDsFromFile} from './getPIDs.js';
import {getPIDsByPortLsof} from './getPIDsByPortLsof.js';
import {processExists} from './processExists.js';

async function getPIDsFromFilePath(
  opts: Partial<Pick<IRunnerOpts, 'pidsFilepath' | 'cwd'>>
) {
  const {pidsFilepath, cwd} = opts;
  if (pidsFilepath) {
    const {pids} = await getPIDsFromFile({
      pidsFilepath,
      cwd,
    });
    return pids.map(pid => Number(pid.pid));
  }

  return [];
}

async function getPIDsFromPorts(opts: {ports?: number[]}) {
  const {ports} = opts;

  let pids: number[] = [];
  if (ports && ports.length > 0) {
    const [fromFind, fromLsof] = await Promise.all([
      Promise.all(
        ports.map(port => (find as unknown as FindFunction)('port', port))
      ).then(processes =>
        processes.map(p => p.map(proc => Number(proc.pid))).flat()
      ),
      getPIDsByPortLsof(ports),
    ]);
    pids = uniq([...fromFind, ...fromLsof]);
  }

  return pids;
}

function killPIDs(
  pids: number[],
  signal: string,
  stopProcessGroup: boolean = false
) {
  pids.forEach(pid => {
    const n = Number(pid);
    // When stopProcessGroup: try process-group kill first (kill(-pid)).
    // Process-group ID equals PID only when that process is the group leader.
    // If the process was started as a child of a shell (e.g. bash start.sh;
    // mongod), the shell is the leader, so process group `pid` does not exist
    // and kill(-pid) returns ESRCH. Fall back to killing the process itself.
    const tryPid = stopProcessGroup ? -n : n;
    try {
      kill(tryPid, signal);
    } catch (error: unknown) {
      if (error) {
        const err = error as AnyObject;
        if (err.code === 'ESRCH' && stopProcessGroup && tryPid < 0) {
          try {
            kill(n, signal);
            return; // fallback succeeded; avoid logging the original kill(-n) ESRCH
          } catch (fallbackErr) {
            const fe = fallbackErr as AnyObject;
            if (fe.code === 'ESRCH') {
              return;
            }
            console.error('endPIDs', pid, signal, fallbackErr);
            return;
          }
        } else if (err.code === 'ESRCH') {
          return;
        }
      }

      console.error('endPIDs', pid, signal, error);
    }
  });
}

export async function endPIDs(
  opts: Partial<Pick<IRunnerOpts, 'pidsFilepath' | 'cwd'>> & {
    pids?: number[];
    ports?: number[];
    signal?: string;
    timeoutMs?: number;
    stopChildren?: boolean;
    stopProcessGroup?: boolean;
  }
) {
  const {
    signal = 'SIGTERM',
    timeoutMs = 5_000,
    stopChildren = true,
    stopProcessGroup = false,
  } = opts;

  const pidsFromFile = (await getPIDsFromFilePath(opts)).filter(processExists);
  const pidsFromPorts = await getPIDsFromPorts(opts);
  let pids = [
    ...pidsFromFile,
    ...defaultTo(opts.pids, []).filter(processExists),
    ...pidsFromPorts,
  ];

  if (stopChildren) {
    const childrenPids = await Promise.all(
      pids.map(pid => findChildrenPIDs(pid))
    );
    pids.push(...childrenPids.flat());
  }

  pids = uniq(pids);

  if (pids.length === 0) {
    return;
  }

  // Kill individual processes and process groups
  killPIDs(pids, signal, stopProcessGroup);

  if (timeoutMs) {
    await waitTimeout(timeoutMs);
    killPIDs(pids, 'SIGKILL', stopProcessGroup);
  }
}
