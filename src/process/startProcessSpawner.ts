import {ChildProcess, spawn} from 'child_process';
import {ensureFile, pathExists} from 'fs-extra';
import {access, constants, open as fsOpen} from 'fs/promises';
import path from 'path';
import {getProcessGroupId} from '../pid/getProcessGroupId.js';
import {writePIDs} from '../pid/writePIDs.js';
import {cleanFile} from '../utils/cleanFile.js';
import {nowISO} from '../utils/dateTime.js';
import {IInstanceOpts, IRunnerOpts} from './types.js';

async function canExecute(filepath: string): Promise<boolean> {
  try {
    await access(filepath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureOrClean(f: string, opts: Pick<IRunnerOpts, 'cwd'>) {
  if (await pathExists(f)) {
    await cleanFile(f, opts);
  } else {
    await ensureFile(f);
  }
}

type ReadyMsg = {
  type: 'ready';
  pid: number;
  pgid?: string;
  logsFilepath: string;
  errorLogsFilepath: string;
};

async function spawnFromInstance(instance: IInstanceOpts) {
  // Ensure we can communicate with a parent via IPC before doing work
  if (typeof process.send !== 'function') {
    console.error('No parent process to communicate with');
    process.exit(0);
  }

  const logsFilenameSuffix = `${instance.runName}-${nowISO()}`;
  const logsFilename = `log-${logsFilenameSuffix}`;
  const errorLogsFilename = `error-${logsFilenameSuffix}`;

  const logsFilepath = path.join(instance.logsFolderpath, logsFilename);
  const errorLogsFilepath = path.join(
    instance.logsFolderpath,
    errorLogsFilename
  );

  console.log('logsFilepath', logsFilepath);
  console.log('errorLogsFilepath', errorLogsFilepath);

  await Promise.all([
    ensureOrClean(logsFilepath, instance),
    ensureOrClean(errorLogsFilepath, instance),
  ]);

  const [out, err] = await Promise.all([
    fsOpen(logsFilepath, 'a'),
    fsOpen(errorLogsFilepath, 'a'),
  ]);

  const isExecutable = await canExecute(instance.startCmdFilepath);
  const command = isExecutable ? instance.startCmdFilepath : 'bash';
  const args = isExecutable ? [] : [instance.startCmdFilepath];

  const child = spawn(command, args, {
    shell: false,
    cwd: instance.cwd || process.cwd(),
    windowsHide: true,
    detached: false,
    stdio: ['ignore', out.fd, err.fd],
    env: {...process.env, ...(instance.env || {})},
  });

  const forward = (signal: NodeJS.Signals) => {
    if (child.pid && !child.killed) {
      try {
        process.kill(child.pid, signal);
      } catch {}
    }
  };
  process.on('SIGTERM', () => forward('SIGTERM'));
  process.on('SIGINT', () => forward('SIGINT'));
  // Exit the spawner when the child process dies
  child.on('exit', code => {
    console.log('child exited', code);
    process.exit(code ?? 0);
  });

  const spawnerPgid = await getProcessGroupId(process.pid);

  console.log('pgid', spawnerPgid);

  if (instance.pidsFilepath) {
    await writePIDs(
      [
        {
          name: instance.name,
          pid: String(process.pid),
          pgid: spawnerPgid,
        },
      ],
      {pidsFilepath: instance.pidsFilepath}
    );
  }

  const msg: ReadyMsg = {
    type: 'ready',
    pid: child.pid ?? 0,
    pgid: spawnerPgid,
    logsFilepath,
    errorLogsFilepath,
  };
  if (process.send) {
    try {
      process.send(msg);
    } catch {}
  }

  // Close file descriptors when process is about to exit
  process.on('exit', () => {
    try {
      out.close();
      err.close();

      child.unref?.();
    } catch {}
  });

  return child;
}

async function main() {
  return await new Promise<ChildProcess>(resolve => {
    process.on('message', async (message: any) => {
      const instance = message as IInstanceOpts;
      resolve(await spawnFromInstance(instance));
    });
  });
}

main()
  .then(child => {
    child.ref();
    console.log('Child process started:', child.pid);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
