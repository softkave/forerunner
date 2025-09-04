import {z} from 'zod';
import {startProcess} from '../run/startProcess.js';
import {IFimidaraCmdDef} from './types.js';

export const ForerunnerStartProcessOptsSchema = z.object({
  startCmdFilepath: z.string(),
  name: z.string(),
  pidsFilepath: z.string(),
  cwd: z.string(),
  logsFolderpath: z.string(),
  runName: z.string(),
});

export type IForerunnerStartProcessOpts = z.infer<
  typeof ForerunnerStartProcessOptsSchema
>;

export async function forerunnerStartProcess(
  opts: IForerunnerStartProcessOpts
) {
  await startProcess(opts);
}

export const fimidaraStartProcessCmdDef: IFimidaraCmdDef<IForerunnerStartProcessOpts> =
  {
    cmd: 'startProcess',
    description: 'Starts process',
    options: [
      {
        shortName: '-s',
        longName: '--startCmdFilepath',
        description: 'Start script filepath',
        type: 'string',
        isRequired: true,
      },
      {
        shortName: '-n',
        longName: '--name',
        description: 'App name',
        type: 'string',
        isRequired: true,
      },
      {
        shortName: '-p',
        longName: '--pidsFilepath',
        description: 'PIDs filepath',
        type: 'string',
        isRequired: true,
      },
      {
        shortName: '-l',
        longName: '--logsFolderpath',
        description: 'Logs folderpath',
        type: 'string',
        isRequired: true,
      },
      {
        shortName: '-r',
        longName: '--runName',
        description: 'App instance name',
        type: 'string',
        isRequired: true,
      },
      {
        shortName: '-c',
        longName: '--cwd',
        description: 'Run directory',
        type: 'string',
        isRequired: true,
      },
    ],
    action: forerunnerStartProcess,
  };
