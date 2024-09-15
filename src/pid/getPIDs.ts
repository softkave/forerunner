import fse from 'fs-extra';
import {keyBy} from 'lodash-es';
import {IRunnerOpts} from '../run/types.js';
import {ProcessIdFileParsed} from './types.js';

export async function getPIDs(opts: Pick<IRunnerOpts, 'pidsFilepath'>) {
  try {
    const untypedJson = await fse.readJson(opts.pidsFilepath, 'utf-8');
    const pids = untypedJson as ProcessIdFileParsed;
    const pidsByName = keyBy(pids, pid => pid.name);
    return {pids, pidsByName};
  } catch (error: unknown) {
    // TODO: log error
    return {pids: [], pidsByName: {}};
  }
}
