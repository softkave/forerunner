import {faker} from '@faker-js/faker';
import {ensureDir, readFile, remove} from 'fs-extra';
import path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {kill} from 'zx';
import {getDummyServerCmd} from '../../utils/dummyServer/run.js';
import {DummyServerSdk} from '../../utils/dummyServer/sdk.js';
import {startInstance} from '../startInstance.js';

const kTestLocalFsDir = '.' + path.sep + 'testdir/startInstance';
const testDir = path.join(kTestLocalFsDir + '/' + faker.number.int({min: 100}));

beforeAll(async () => {
  await ensureDir(testDir);
});

afterAll(async () => {
  await remove(testDir);
});

describe('startInstance', () => {
  test('instance started', async () => {
    const runName = faker.lorem.word();
    const instanceName = faker.lorem.word();
    const logsFolderpath = path.join(
      testDir,
      faker.number.int({min: 10_000}).toString()
    );
    const {cmd, port} = getDummyServerCmd();
    const sdk = new DummyServerSdk({port});

    const {pid, logsFilepath} = await startInstance(
      {name: instanceName, startCmd: cmd},
      {runName, logsFolderpath, cwd: process.cwd()}
    );
    const pidNo = Number(pid);

    try {
      const echoMsg = 'hello, world!';
      const echoResponse = await sdk.postEcho({message: echoMsg});
      expect(echoMsg).toBe(echoResponse);

      const logMsg = 'hello, world!';
      await sdk.postLog({message: logMsg});
      const logs = await readFile(logsFilepath, 'utf-8');
      expect(
        logs.includes(logMsg),
        `"${logs}" does not contain "${logMsg}"`
      ).toBeTruthy();
    } finally {
      kill(pidNo);
    }
  });
});
