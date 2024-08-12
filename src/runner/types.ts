import {ValueOf} from 'type-fest';

export interface IInstanceOpts {
  name: string;
  prestartCmd?: string;
  startCmd: string;
}

export const kFileEntryType = {
  file: 'file',
  folder: 'folder',
} as const;

export type FileEntryType = ValueOf<typeof kFileEntryType>;

/** currently supports only fimidara */
export interface IFilesOpts {
  /** can be a file or folder, and `to` must be the same. it follows a posix
   * absolute/relative filepath format, i.e. `/rootname/absolute/file` is
   * absolute and starting with workspace rootname, and `relative/file` is
   * relative without workspace rootname */
  from: string;
  to: string;
  /** if not provided and there's a file and folder with the same `from` name,
   * it defaults to `file` */
  type?: FileEntryType;
}

export interface IRunnerOpts {
  runName: string;
  cwd: string;
  logsFolderpath: string;
  logsFilepath?: string;
  prestartCmd?: string;
  processIdFilepath: string;
  instances: Array<IInstanceOpts>;

  filesBasepath?: string;
  files?: Array<IFilesOpts>;

  fimidaraToken?: string;
  fimidaraBasepath?: string;
}

export interface IProcessIdItem {
  name: string;
  pid: string;
}

export type ProcessIdFileParsed = IProcessIdItem[];
