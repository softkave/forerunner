import assert from 'assert';
import {FimidaraEndpoints} from 'fimidara';

export function getFimidara(opts: {fimidaraToken: string}) {
  assert.ok(opts.fimidaraToken, 'fimidaraToken not provided');
  return new FimidaraEndpoints({authToken: opts.fimidaraToken});
}
