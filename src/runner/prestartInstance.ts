import {runExeca} from '../utils/runExeca.js';
import {IInstanceOpts, IRunnerOpts} from './types.js';

export async function prestartInstanceList(
  opts: Pick<IRunnerOpts, 'cwd' | 'prestartCmd'>
) {
  if (opts.prestartCmd) {
    return await runExeca(opts.prestartCmd, {cwd: opts.cwd});
  }

  return undefined;
}

export async function prestartInstance(
  instance: Pick<IInstanceOpts, 'prestartCmd'>,
  opts: Pick<IRunnerOpts, 'cwd'>
) {
  if (instance.prestartCmd) {
    return await runExeca(instance.prestartCmd, {cwd: opts.cwd});
  }

  return undefined;
}
