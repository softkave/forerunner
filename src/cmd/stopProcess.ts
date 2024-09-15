import {z} from 'zod';
import {endPIDs} from '../pid/endPIDs.js';
import {IFimidaraCmdDef} from './types.js';

export const zForerunnerStopProcessOpts = z.object({
  pidsFilepath: z.string(),
  cwd: z.string(),
});

export type IForerunnerStopProcessOpts = z.infer<
  typeof zForerunnerStopProcessOpts
>;

export async function forerunnerStopProcess(opts: IForerunnerStopProcessOpts) {
  await endPIDs(opts);
}

export const fimidaraStopProcessCmdDef: IFimidaraCmdDef<IForerunnerStopProcessOpts> =
  {
    cmd: 'stopProcess',
    description: 'Stops process',
    options: [
      {
        shortName: '-p',
        longName: '--pidsFilepath',
        description: 'PIDs filepath',
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
    action: forerunnerStopProcess,
  };
