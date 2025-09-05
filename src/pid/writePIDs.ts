import fse from 'fs-extra';
import {IRunnerOpts} from '../process/types.js';
import {IProcessIdItem} from './types.js';

export async function writePIDs(
  pidList: IProcessIdItem[],
  opts: Pick<IRunnerOpts, 'pidsFilepath'>
) {
  await fse.ensureFile(opts.pidsFilepath);
  await fse.writeJson(opts.pidsFilepath, pidList, 'utf-8');
}
