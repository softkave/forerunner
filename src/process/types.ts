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

/** currently supports only fimidara */
export interface IFilesOpts {
  /** can be a file or folder, and `to` must be the same. it follows a posix
   * absolute/relative filepath format, i.e. `/rootname/absolute/file` is
   * absolute and starting with workspace rootname, and `relative/file` is
   * relative without workspace rootname */
  from: string;
  to: string;
}

export interface IRunnerOpts {
  runName: string;
  cwd?: string;
  logsFolderpath: string;
  logsFilepath?: string;
  pidsFilepath: string;
  instances: Array<IInstanceOpts>;
}
