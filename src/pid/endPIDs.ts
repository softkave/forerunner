import find from 'find-process';
import {defaultTo, uniq} from 'lodash-es';
import {kill} from 'process';
import {waitTimeout} from 'softkave-js-utils';
import {IRunnerOpts} from '../process/types.js';
import {findChildrenPIDs} from './findChildrenPIDs.js';
import {getPIDsFromFile} from './getPIDs.js';

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

async function getPGIDsFromFilePath(
  opts: Partial<Pick<IRunnerOpts, 'pidsFilepath' | 'cwd'>>
) {
  const {pidsFilepath, cwd} = opts;
  if (pidsFilepath) {
    const {pids} = await getPIDsFromFile({
      pidsFilepath,
      cwd,
    });
    return pids
      .filter(pid => pid.pgid) // Only include items that have a pgid
      .map(pid => Number(pid.pgid));
  }

  return [];
}

async function getPIDsFromPorts(opts: {ports?: number[]}) {
  const {ports} = opts;
  if (ports) {
    const processes = await Promise.all(
      ports.map(port => find.default('port', port))
    );
    return processes.map(process => process.map(process => process.pid)).flat();
  }

  return [];
}

function killPIDs(
  pids: number[],
  signal: string,
  stopProcessGroup: boolean = false
) {
  pids.forEach(pid => {
    try {
      // Use negative PID to kill process group if stopProcessGroup is true
      const targetPid = stopProcessGroup ? -Number(pid) : Number(pid);
      kill(targetPid, signal);
    } catch (error) {
      // do nothing
    }
  });
}

function killPGIDs(pgids: number[], signal: string) {
  pgids.forEach(pgid => {
    try {
      // Use negative PGID to kill process group
      kill(-Number(pgid), signal);
    } catch (error) {
      // do nothing
    }
  });
}

export async function endPIDs(
  opts: Partial<Pick<IRunnerOpts, 'pidsFilepath' | 'cwd'>> & {
    pids?: number[];
    pgids?: number[];
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

  const pidsFromFile = await getPIDsFromFilePath(opts);
  const pidsFromPorts = await getPIDsFromPorts(opts);
  let pids = [...pidsFromFile, ...defaultTo(opts.pids, []), ...pidsFromPorts];
  let pgids = defaultTo(opts.pgids, []);

  // Include PGIDs from file when stopProcessGroup is true
  if (stopProcessGroup) {
    const pgidsFromFile = await getPGIDsFromFilePath(opts);
    pgids = [...pgids, ...pgidsFromFile];
  }

  if (stopChildren) {
    const childrenPids = await Promise.all(
      pids.map(pid => findChildrenPIDs(pid))
    );
    pids.push(...childrenPids.flat());
  }

  pids = uniq(pids);
  pgids = uniq(pgids);

  // Kill individual processes and process groups
  killPIDs(pids, signal, stopProcessGroup);
  killPGIDs(pgids, signal);

  if (timeoutMs) {
    await waitTimeout(timeoutMs);
    killPIDs(pids, 'SIGKILL', stopProcessGroup);
    killPGIDs(pgids, 'SIGKILL');
  }
}
