import assert from 'assert';
import {parseArgs} from 'util';
import {newDummyServer} from './server.js';

const args = parseArgs({
  options: {
    port: {
      type: 'string',
      short: 'p',
    },
  },
});

const port = Number(args.values.port);
assert.ok(port, '--port or -p not provided');

await newDummyServer({port});

console.log('Dummy server started', {port});
