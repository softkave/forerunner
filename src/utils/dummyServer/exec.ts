import assert from 'assert';
import {parseArgs} from 'util';
import {newDummyServer} from './server.js';

const args = parseArgs({
  args: process.argv,
  options: {
    port: {
      type: 'string',
      short: 'p',
    },
  },
});

const port = Number(args.values.port);
assert(port, '--port or -p not provided');

await newDummyServer({port});
