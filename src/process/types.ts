import {AnyObject} from 'softkave-js-utils';

export interface IInstanceOpts {
  name: string;
  startCmdFilepath: string;
  pidsFilepath?: string;
  runName: string;
  cwd?: string;
  logsFolderpath: string;
  env?: AnyObject;
}

export interface IRunnerOpts {
  runName: string;
  cwd?: string;
  logsFolderpath: string;
  logsFilepath?: string;
  pidsFilepath: string;
  instances: Array<IInstanceOpts>;
}
