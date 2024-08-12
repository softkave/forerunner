import {IRunnerOpts} from '../runner/types.js';
import {runExeca} from './runExeca.js';

export async function cleanFile(
  filepath: string,
  opts: Pick<IRunnerOpts, 'cwd'>
) {
  await runExeca(`cat /dev/null > ${filepath}`, {cwd: opts.cwd});
}
