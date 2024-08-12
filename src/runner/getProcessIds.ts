import {readJson} from 'fs-extra';
import {keyBy} from 'lodash-es';
import {IRunnerOpts, ProcessIdFileParsed} from './types.js';

export async function getProcessIds(
  opts: Pick<IRunnerOpts, 'processIdFilepath'>
) {
  try {
    const untypedJson = await readJson(opts.processIdFilepath, 'utf-8');
    const pids = untypedJson as ProcessIdFileParsed;
    const pidsByName = keyBy(pids, pid => pid.name);
    return {pids, pidsByName};
  } catch (error: unknown) {
    // TODO: log error
    return {pids: [], pidsByName: {}};
  }
}
