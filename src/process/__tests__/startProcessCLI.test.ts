import {faker} from '@faker-js/faker';
import {ensureDir, ensureFile} from 'fs-extra';
import {readFile, writeFile} from 'fs/promises';
import path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {getDummyServerCmd} from '../../utils/dummyServer/run.js';
import {DummyServerSdk} from '../../utils/dummyServer/sdk.js';
import {
  stopDummyServer,
  waitForDummyServer,
} from '../../utils/dummyServer/testHelpers.js';
import {ConsoleForeLogger} from '../../utils/foreLogger/ConsoleForeLogger.js';
import {startProcessCLI} from '../startProcessCLI.js';

const testDir = '.' + path.sep + 'testdir/startProcessCLI';

beforeAll(async () => {
  await ensureDir(testDir);
});

afterAll(async () => {
  // await remove(testDir);
});

describe('startProcessCLI', () => {
  test(
    'starts a process and writes PIDs to a file',
    {timeout: 30_000},
    async () => {
      const runName = faker.lorem.word();
      const instanceName = faker.lorem.word();
      const logsFolderpath = path.join(
        testDir,
        faker.number.int({min: 10_000}).toString()
      );
      const pidsFilepath = path.join(
        testDir,
        faker.number.int({min: 10_000}).toString()
      );
      await ensureDir(logsFolderpath);

      const {cmd, port} = getDummyServerCmd();
      const sdk = new DummyServerSdk({port});

      const cmdFilepath = path.join(
        testDir,
        faker.number.int({min: 10_000}).toString()
      );
      await ensureFile(cmdFilepath);
      await writeFile(cmdFilepath, cmd);

      const {pid, logsFilepath, errorLogsFilepath} = await startProcessCLI({
        opts: {
          name: instanceName,
          runName,
          startCmd: cmdFilepath,
          logsDir: logsFolderpath,
          pidsFile: pidsFilepath,
          cwd: process.cwd(),
          silent: true,
        },
        logger: new ConsoleForeLogger({silent: true}),
      });

      try {
        await waitForDummyServer(sdk);

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

        const pidsContent = await readFile(pidsFilepath, 'utf-8');
        expect(pidsContent).toContain(pid);
      } catch (err) {
        const errorLogs = await readFile(errorLogsFilepath, 'utf-8').catch(
          () => ''
        );
        throw new Error(
          `${err instanceof Error ? err.message : String(err)}\nstderr log:\n${errorLogs}`,
          {cause: err}
        );
      } finally {
        await stopDummyServer(sdk);
      }
    }
  );
});
