import {runExeca} from '../utils/runExeca.js';
import {IGitRunnerOpts} from './types.js';

export async function gitCheckout(opts: IGitRunnerOpts) {
  await runExeca(`git checkout ${opts.snapshotName}`, {cwd: opts.cwd});
}
