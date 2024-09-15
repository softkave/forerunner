import {random} from 'lodash-es';
import {kDummyServerConstants} from './constants.js';

export function getDummyServerCmd() {
  const port = random(
    kDummyServerConstants.port.min,
    kDummyServerConstants.port.max
  );
  const cmd = `npx --yes -- tsx ${__dirname}/exec.ts -p ${port}`;
  return {cmd, port};
}
