import {z} from 'zod';
import {loadEnvForCwd} from '../runEnv/loadEnvForCwd.js';
import type {IForeLogger} from '../utils/foreLogger/types.js';
import {startProcess} from './startProcess.js';

export const StartProcessCLIOptionsSchema = z.object({
  name: z.string().min(1),
  runName: z.string().min(1).optional(),
  startCmd: z.string().min(1),
  cwd: z.string().min(1).optional(),
  logsDir: z.string().min(1),
  pidsFile: z.string().min(1).optional(),
  envFilePaths: z.array(z.string()).optional(),
  silent: z.boolean().optional(),
});

export type StartProcessCLIOptions = z.infer<
  typeof StartProcessCLIOptionsSchema
>;

export async function startProcessCLI(params: {
  opts: StartProcessCLIOptions;
  logger: IForeLogger;
}) {
  const {opts, logger} = params;
  const cwd = opts.cwd ?? process.cwd();
  const runName = opts.runName ?? opts.name;

  let env: NodeJS.ProcessEnv | undefined;
  if (opts.envFilePaths !== undefined) {
    const loaded = await loadEnvForCwd({
      cwd,
      envFilePaths: opts.envFilePaths,
    });

    if (!opts.silent) {
      for (const label of loaded.logLabels) {
        logger.log(`Using ${label}`);
      }
    }
    env = loaded.env;
  }

  const result = await startProcess({
    name: opts.name,
    runName,
    startCmdFilepath: opts.startCmd,
    cwd,
    logsFolderpath: opts.logsDir,
    pidsFilepath: opts.pidsFile,
    env,
  });

  if (!opts.silent) {
    logger.log(`Started process PID ${result.pid}`);
    logger.log(`Logs: ${result.logsFilepath}`);
    logger.log(`Error logs: ${result.errorLogsFilepath}`);
  }

  return result;
}
