import fse from 'fs-extra';
import {keyBy} from 'lodash-es';
import path from 'path';
import {IRunnerOpts} from '../process/types.js';
import {ProcessIdFileParsed} from './types.js';

export async function getPIDsFromFile(
  opts: Pick<IRunnerOpts, 'pidsFilepath'> & Partial<Pick<IRunnerOpts, 'cwd'>>
) {
  const {cwd} = opts;
  try {
    const pidsFilepath = cwd
      ? path.join(cwd, opts.pidsFilepath)
      : opts.pidsFilepath;
    const untypedJson = await fse.readJson(pidsFilepath, 'utf-8');
    const pids = untypedJson as ProcessIdFileParsed;
    const pidsByName = keyBy(pids, pid => pid.name);
    return {pids, pidsByName};
  } catch (error: unknown) {
    // TODO: log error
    return {pids: [], pidsByName: {}};
  }
}
