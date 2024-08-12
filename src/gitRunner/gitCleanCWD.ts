import {runExeca} from '../utils/runExeca.js';
import {IGitRunnerOpts} from './types.js';

export async function gitCleanCWD(opts: IGitRunnerOpts) {
  await runExeca('git restore .', {cwd: opts.cwd});
}
