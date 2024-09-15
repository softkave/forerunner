import {kill} from 'zx';
import {IRunnerOpts} from '../run/types.js';
import {getPIDs} from './getPIDs.js';

export async function endPIDs(opts: Pick<IRunnerOpts, 'pidsFilepath' | 'cwd'>) {
  const {pids} = await getPIDs(opts);
  await Promise.all(pids.map(pid => kill(Number(pid.pid), 'SIGINT')));
}
