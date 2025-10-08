import find from 'find-process';
import {kill} from 'process';
import {waitTimeout} from 'softkave-js-utils';
import {IRunnerOpts} from '../process/types.js';
import {getPIDsFromFile} from './getPIDs.js';

export async function endPIDs(
  opts: Partial<Pick<IRunnerOpts, 'pidsFilepath' | 'cwd'>> & {
    otherPids?: number[];
    ports?: number[];
    signal?: string;
    killAfterMs?: number;
  }
) {
  const {signal = 'SIGTERM', killAfterMs = 5_000} = opts;

  let pidsFromFile: number[] = [];
  if (opts.pidsFilepath) {
    const {pids} = await getPIDsFromFile({
      pidsFilepath: opts.pidsFilepath,
      cwd: opts.cwd,
    });
    pidsFromFile = pids.map(pid => Number(pid.pid));
  }

  let pidsFromPorts: number[] = [];
  if (opts.ports) {
    const processes = await Promise.all(
      opts.ports.map(port => find.default('port', port))
    );
    pidsFromPorts = processes
      .map(process => process.map(process => process.pid))
      .flat();
  }

  const pids = [...pidsFromFile, ...(opts.otherPids || []), ...pidsFromPorts];
  pids.forEach(pid => {
    try {
      kill(Number(pid), signal);
    } catch (error) {
      // do nothing
    }
  });

  if (killAfterMs) {
    await waitTimeout(killAfterMs);
    pids.forEach(pid => {
      try {
        kill(Number(pid), 'SIGKILL');
      } catch (error) {
        // do nothing
      }
    });
  }
}
