import {random} from 'lodash-es';
import {$} from 'zx';
import {kDummyServerConstants} from './constants.js';
import {DummyServerSdk} from './sdk.js';

export function getDummyServerCmd() {
  const port = random(
    kDummyServerConstants.port.min,
    kDummyServerConstants.port.max
  );
  const cmd = `npx tsx -y ${__dirname}/exec.ts -- -p ${port}`;
  return {cmd, port};
}

export function runDummyServer() {
  const {port, cmd} = getDummyServerCmd();
  const p = $`${cmd}`;
  const sdk = new DummyServerSdk({port});
  return {p, sdk};
}
