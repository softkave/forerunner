import assert from 'assert';
import {FimidaraEndpoints} from 'fimidara';
import {IRunnerOpts} from '../runner/types.js';

export function getFimidara(opts: Pick<IRunnerOpts, 'fimidaraToken'>) {
  assert(opts.fimidaraToken, 'fimidaraToken not provided');
  return new FimidaraEndpoints({authToken: opts.fimidaraToken});
}
