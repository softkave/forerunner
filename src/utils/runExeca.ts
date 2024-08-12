import {execa, ExecaMethod} from 'execa';
import {kForerunnerConstants} from './constants.js';
import {ForerunnerExecaError} from './errors.js';

export const runExeca = async (...args: Parameters<ExecaMethod<{}>>) => {
  const execaResult = await execa(...args);

  if (execaResult.exitCode !== kForerunnerConstants.okExitCode) {
    throw new ForerunnerExecaError({execaResult});
  }

  return execaResult;
};
