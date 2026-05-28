import {promises as fsp} from 'fs';

export async function fileExists(path: string): Promise<boolean> {
  return fsp
    .access(path)
    .then(() => true)
    .catch(() => false);
}
