import {writeFile} from 'fs/promises';
import path from 'path';
import {IRunnerOpts} from '../run/types.js';

export async function cleanFile(
  filepath: string,
  opts: Pick<IRunnerOpts, 'cwd'>
) {
  await writeFile(path.join(opts.cwd || '', filepath), '');
}
