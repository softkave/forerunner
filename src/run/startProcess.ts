import {spawn} from 'child_process';
import {ensureFile, pathExists} from 'fs-extra';
import {open, readFile} from 'fs/promises';
import path from 'path';
import {writePIDs} from '../pid/writePIDs.js';
import {cleanFile} from '../utils/cleanFile.js';
import {nowISO} from '../utils/dateTime.js';
import {IInstanceOpts, IRunnerOpts} from './types.js';

async function ensureOrClean(f: string, opts: Pick<IRunnerOpts, 'cwd'>) {
  if (await pathExists(f)) {
    await cleanFile(f, opts);
  } else {
    await ensureFile(f);
  }
}

// async function canExecute(f: string) {
//   try {
//     await access(f, constants.X_OK);
//     return true;
//   } catch {
//     return false;
//   }
// }

export async function startProcess(instance: IInstanceOpts) {
  // if (!(await canExecute(instance.startCmdFilepath))) {
  //   await chmod(
  //     instance.startCmdFilepath,
  //     0o744 /** me (execute), group (read), others (read) */
  //   );
  // }

  const logsFilenameSuffix = `${instance.runName}-${nowISO()}`;
  const logsFilename = `log-${logsFilenameSuffix}`;
  const errorLogsFilename = `error-${logsFilenameSuffix}`;

  const logsFilepath = path.join(instance.logsFolderpath, logsFilename);
  const errorLogsFilepath = path.join(
    instance.logsFolderpath,
    errorLogsFilename
  );

  await Promise.all([
    ensureOrClean(logsFilepath, instance),
    ensureOrClean(errorLogsFilepath, instance),
  ]);

  const [out, err] = await Promise.all([
    open(logsFilepath, 'a'),
    open(errorLogsFilepath, 'a'),
  ]);

  const bat = spawn(await readFile(instance.startCmdFilepath, 'utf-8'), {
    shell: true,
    cwd: instance.cwd,
    windowsHide: true,
    detached: true,
    stdio: ['ignore', out.fd, err.fd],
    env: {...process.env, ...instance.env},
  });

  bat.unref();
  const pid = bat.pid?.toString();
  if (!pid) {
    throw new Error(`Could not start process for instance ${instance.name}`);
  }

  if (instance.pidsFilepath) {
    await writePIDs([{pid, name: instance.name}], {
      pidsFilepath: instance.pidsFilepath,
    });
  }

  return {pid, logsFilepath, errorLogsFilepath};
}
