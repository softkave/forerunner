import {runExeca} from '../utils/runExeca.js';
import {IGitRunnerOpts} from './types.js';

export async function gitPull(opts: IGitRunnerOpts) {
  await runExeca('git pull', {cwd: opts.cwd});
}
