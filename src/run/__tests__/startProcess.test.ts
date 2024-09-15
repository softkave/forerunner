import {faker} from '@faker-js/faker';
import {ensureDir, ensureFile} from 'fs-extra';
import {readFile, writeFile} from 'fs/promises';
import path from 'path';
import {waitTimeout} from 'softkave-js-utils';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {kill} from 'zx';
import {getDummyServerCmd} from '../../utils/dummyServer/run.js';
import {DummyServerSdk} from '../../utils/dummyServer/sdk.js';
import {startProcess} from '../startProcess.js';

const testDir = '.' + path.sep + 'testdir/startProcess';

beforeAll(async () => {
  await ensureDir(testDir);
});

afterAll(async () => {
  // await remove(testDir);
});

describe('startProcess', () => {
  test('instance started', {timeout: 30_000}, async () => {
    const runName = faker.lorem.word();
    const instanceName = faker.lorem.word();
    const logsFolderpath = path.join(
      testDir,
      faker.number.int({min: 10_000}).toString()
    );
    const {cmd, port} = getDummyServerCmd();
    const sdk = new DummyServerSdk({port});

    const cmdFilepath = path.join(
      testDir,
      faker.number.int({min: 10_000}).toString()
    );
    await ensureFile(cmdFilepath);
    await writeFile(cmdFilepath, cmd);

    const {pid, logsFilepath} = await startProcess({
      name: instanceName,
      startCmdFilepath: cmdFilepath,
      runName,
      logsFolderpath,
      cwd: process.cwd(),
    });
    const pidNo = Number(pid);

    try {
      await waitTimeout(1_000);

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
      await kill(pidNo);
    }
  });
});
