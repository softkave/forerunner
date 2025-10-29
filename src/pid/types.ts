export interface IProcessIdItem {
  name: string;
  pid: string;
  pgid?: string;
}

export type ProcessIdFileParsed = IProcessIdItem[];
