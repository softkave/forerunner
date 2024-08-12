import path from 'path';
import {IRunnerOpts} from '../runner/types.js';

export function getLocalFilepath(
  filepath: string,
  opts: Pick<IRunnerOpts, 'filesBasepath'>
) {
  if (path.isAbsolute(filepath)) {
    return filepath;
  }

  return opts.filesBasepath
    ? path.join(opts.filesBasepath, filepath)
    : filepath;
}

export function getFimidaraFilepath(
  filepath: string,
  opts: Pick<IRunnerOpts, 'fimidaraBasepath'>
) {
  if (path.posix.isAbsolute(filepath)) {
    return filepath;
  }

  return opts.fimidaraBasepath
    ? path.join(opts.fimidaraBasepath, filepath)
    : filepath;
}
