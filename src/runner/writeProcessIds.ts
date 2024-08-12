import {ensureFile, writeJson} from 'fs-extra';
import {IProcessIdItem, IRunnerOpts} from './types.js';

export async function writeProcessIds(
  pidList: IProcessIdItem[],
  opts: Pick<IRunnerOpts, 'processIdFilepath'>
) {
  await ensureFile(opts.processIdFilepath);
  await writeJson(opts.processIdFilepath, pidList, 'utf-8');
}
