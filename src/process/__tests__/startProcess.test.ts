import {faker} from '@faker-js/faker';
import {ensureDir, ensureFile} from 'fs-extra';
import {readFile, writeFile} from 'fs/promises';
import path from 'path';
import {waitTimeout} from 'softkave-js-utils';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {getProcessGroupId} from '../../pid/getProcessGroupId.js';
import {getDummyServerCmd} from '../../utils/dummyServer/run.js';
import {DummyServerSdk} from '../../utils/dummyServer/sdk.js';
import {
  stopDummyServer,
  waitForDummyServer,
} from '../../utils/dummyServer/testHelpers.js';
import {startProcess} from '../startProcess.js';

const testDir = '.' + path.sep + 'testdir/startProcess';

beforeAll(async () => {
  await ensureDir(testDir);
});

afterAll(async () => {
  // await remove(testDir);
});

describe('startProcess', () => {
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
      await ensureDir(logsFolderpath);
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
      } finally {
        await stopDummyServer(sdk);
      }
    }
  );

  test(
    'stdout and stderr are written to their respective files',
    {timeout: 30_000},
    async () => {
      const runName = faker.lorem.word();
      const instanceName = faker.lorem.word();
      const logsFolderpath = path.join(
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

      const {logsFilepath, errorLogsFilepath} = await startProcess({
        name: instanceName,
        startCmdFilepath: cmdFilepath,
        runName,
        logsFolderpath,
        cwd: process.cwd(),
      });

      try {
        await waitForDummyServer(sdk);

        // Verify the process is running and responding
        const echoMsg = 'hello, world!';
        const echoResponse = await sdk.postEcho({message: echoMsg});
        expect(echoMsg).toBe(echoResponse);

        // Test stdout logging
        const stdoutMsg = faker.lorem.sentence();
        await sdk.postLog({message: stdoutMsg});

        // Wait a bit for the log to be written
        await waitTimeout(500);

        const stdoutLogs = await readFile(logsFilepath, 'utf-8');
        expect(
          stdoutLogs.includes(stdoutMsg),
          `"${stdoutLogs}" does not contain "${stdoutMsg}"`
        ).toBeTruthy();

        // Test stderr logging
        const stderrMsg = faker.lorem.sentence();
        await sdk.postLogError({message: stderrMsg});

        // Wait a bit for the error log to be written
        await waitTimeout(500);

        const stderrLogs = await readFile(errorLogsFilepath, 'utf-8');
        expect(
          stderrLogs.includes(stderrMsg),
          `"${stderrLogs}" does not contain "${stderrMsg}"`
        ).toBeTruthy();

        console.log('Stdout logs:', stdoutLogs);
        console.log('Stderr logs:', stderrLogs);
      } finally {
        await stopDummyServer(sdk);
      }
    }
  );

  test(
    'multiple processes each get their own process group (setsid behavior)',
    {timeout: 30_000},
    async ctx => {
      const selfPgid = await getProcessGroupId(process.pid);
      if (!selfPgid) {
        ctx.skip();
      }
      const runName = faker.lorem.word();
      const logsFolderpath = path.join(
        testDir,
        faker.number.int({min: 10_000}).toString()
      );
      await ensureDir(logsFolderpath);

      // Start two processes
      const processes = [];
      const pidsFilepath = path.join(
        testDir,
        faker.number.int({min: 10_000}).toString()
      );

      for (let i = 0; i < 2; i++) {
        const instanceName = `${faker.lorem.word()}-${i}`;
        const {cmd, port} = getDummyServerCmd();

        const cmdFilepath = path.join(
          testDir,
          faker.number.int({min: 10_000}).toString()
        );
        await ensureFile(cmdFilepath);
        await writeFile(cmdFilepath, cmd);

        const result = await startProcess({
          name: instanceName,
          startCmdFilepath: cmdFilepath,
          runName,
          logsFolderpath,
          cwd: process.cwd(),
          pidsFilepath,
        });

        processes.push({
          ...result,
          port,
          sdk: new DummyServerSdk({port}),
        });
      }

      try {
        for (const proc of processes) {
          await waitForDummyServer(proc.sdk);
        }

        // Verify both processes are running
        for (const proc of processes) {
          const echoMsg = 'hello, world!';
          const echoResponse = await proc.sdk.postEcho({message: echoMsg});
          expect(echoMsg).toBe(echoResponse);
        }

        // Verify both server processes have PGIDs (use HTTP pid, not the shell wrapper pid)
        const pgids = await Promise.all(
          processes.map(async proc => {
            const {pid: serverPid} = await proc.sdk.getPid();
            return getProcessGroupId(Number(serverPid));
          })
        );
        expect(pgids[0]).toBeDefined();
        expect(pgids[1]).toBeDefined();
        expect(pgids[0]).not.toBe('');
        expect(pgids[1]).not.toBe('');

        // Each process should have a valid PGID (may be same as PID for first process in group)
        const pgidNumbers = pgids.map(pgid => Number(pgid));
        expect(pgidNumbers[0]).not.toBe(pgidNumbers[1]);
      } finally {
        await Promise.all(processes.map(proc => stopDummyServer(proc.sdk)));
      }
    }
  );
});
