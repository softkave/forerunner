import {writeFile} from 'fs/promises';
import path from 'path';
import {IRunnerOpts} from '../process/types.js';

export async function cleanFile(
  filepath: string,
  opts: Pick<IRunnerOpts, 'cwd'>
) {
  const absoluteFilepath =
    opts.cwd && !path.isAbsolute(filepath)
      ? path.join(opts.cwd, filepath)
      : filepath;
  await writeFile(absoluteFilepath, '');
}
