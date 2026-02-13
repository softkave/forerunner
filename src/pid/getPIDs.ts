import fse from 'fs-extra';
import {keyBy} from 'lodash-es';
import path from 'path';
import {IRunnerOpts} from '../process/types.js';
import {IProcessIdItem, ProcessIdFileParsed} from './types.js';

export async function getPIDsFromFile(
  opts: Pick<IRunnerOpts, 'pidsFilepath'> & Partial<Pick<IRunnerOpts, 'cwd'>>
): Promise<{
  pids: ProcessIdFileParsed;
  pidsByName: Record<string, IProcessIdItem>;
}> {
  const {cwd} = opts;
  try {
    const pidsFilepath =
      cwd && !path.isAbsolute(opts.pidsFilepath)
        ? path.join(cwd, opts.pidsFilepath)
        : opts.pidsFilepath;

    if (!(await fse.pathExists(pidsFilepath))) {
      return {pids: [], pidsByName: {}};
    }

    const untypedJson = await fse.readJson(pidsFilepath, 'utf-8');
    const pids = untypedJson as ProcessIdFileParsed;
    const pidsByName = keyBy(pids, pid => pid.name);
    return {pids, pidsByName};
  } catch (error: unknown) {
    // TODO: log error
    console.error('getPIDsFromFile error', error);
    return {pids: [], pidsByName: {}};
  }
}
