import {runner} from '../runner/runner.js';
import {gitCheckout} from './gitCheckout.js';
import {gitCleanCWD} from './gitCleanCWD.js';
import {gitPull} from './gitPull.js';
import {IGitRunnerOpts} from './types.js';

export async function gitRunner(opts: IGitRunnerOpts) {
  await gitCleanCWD(opts);
  await gitPull(opts);
  await gitCheckout(opts);

  await runner({...opts, runName: opts.snapshotName});
}
