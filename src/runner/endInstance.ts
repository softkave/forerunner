import {runExeca} from '../utils/runExeca.js';
import {IRunnerOpts} from './types.js';

export async function endProcess(
  pid: string | number,
  opts: Pick<IRunnerOpts, 'cwd'>
) {
  await runExeca(`kill -s 15 ${pid}`, {cwd: opts.cwd});
}
