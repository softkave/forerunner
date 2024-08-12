import path from 'path';
import {cleanFile} from '../utils/cleanFile.js';
import {nowISO} from '../utils/dateTime.js';
import {ForerunnerProcessError} from '../utils/errors.js';
import {runExeca} from '../utils/runExeca.js';
import {IInstanceOpts, IRunnerOpts} from './types.js';

export async function startInstance(
  instance: Pick<IInstanceOpts, 'startCmd' | 'name'>,
  opts: Pick<IRunnerOpts, 'cwd' | 'logsFolderpath' | 'runName'>
) {
  const logsFilename = `${opts.runName}-${instance.name}-${nowISO()}`;
  const logsFilepath = path.join(opts.logsFolderpath, logsFilename);
  await cleanFile(logsFilepath, opts);

  const cmd = `nohup ${instance.startCmd} >${logsFilepath} &`;
  const {stdout, stderr, code} = await runExeca(cmd, {cwd: opts.cwd});
  const pid = stdout?.toString();

  if (!pid) {
    throw new ForerunnerProcessError({
      code,
      stdout,
      stderr,
      message: `Could not start process for instance ${instance.name}`,
    });
  }

  return {pid, logsFilepath};
}
