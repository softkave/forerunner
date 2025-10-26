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

function killPIDs(pids: number[], signal: string) {
  pids.forEach(pid => {
    try {
      kill(Number(pid), signal);
    } catch (error) {
      // do nothing
    }
  });
}

export async function endPIDs(
  opts: Partial<Pick<IRunnerOpts, 'pidsFilepath' | 'cwd'>> & {
    otherPids?: number[];
    ports?: number[];
    signal?: string;
    timeoutMs?: number;
    stopChildren?: boolean;
  }
) {
  const {signal = 'SIGTERM', timeoutMs = 5_000, stopChildren = true} = opts;

  const pidsFromFile = await getPIDsFromFilePath(opts);
  const pidsFromPorts = await getPIDsFromPorts(opts);
  let pids = [
    ...pidsFromFile,
    ...defaultTo(opts.otherPids, []),
    ...pidsFromPorts,
  ];

  if (stopChildren) {
    const childrenPids = await Promise.all(
      pids.map(pid => findChildrenPIDs(pid))
    );
    pids.push(...childrenPids.flat());
  }

  pids = uniq(pids);
  killPIDs(pids, signal);

  if (timeoutMs) {
    await waitTimeout(timeoutMs);
    killPIDs(pids, 'SIGKILL');
  }
}
