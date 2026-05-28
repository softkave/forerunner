import path from 'path';

/**
 * Resolves `workingDir` to an absolute path (relative dirs are resolved from
 * cwd).
 */
export function resolveWorkingDir(workingDir: string): string {
  return path.isAbsolute(workingDir) ? workingDir : path.resolve(workingDir);
}

/**
 * Resolves `dirOrPath` under `workingDir` when relative; absolute paths are
 * unchanged.
 */
export function resolvePathUnderWorkingDir(
  workingDir: string,
  dirOrPath: string
): string {
  if (path.isAbsolute(dirOrPath)) {
    return dirOrPath;
  }

  // Backwards compatibility: some older configs passed paths that already
  // included `workingDir` (but were still relative). Avoid duplicating.
  const wd = path.normalize(workingDir).replace(/[\\\/]+$/, '');
  let rel = path.normalize(dirOrPath);
  if (wd && wd !== '.' && (rel === wd || rel.startsWith(wd + path.sep))) {
    rel = rel.slice(wd.length).replace(/^[\\\/]+/, '');
  }

  return path.join(resolveWorkingDir(workingDir), rel);
}
