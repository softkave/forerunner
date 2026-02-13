import {readdirSync, statSync} from 'fs';
import path from 'path';

/**
 * Discovers all files in the given directory whose names start with `.env`.
 * Returns only files (not directories), sorted with `.env` first, then
 * alphabetically.
 */
export function discoverEnvFiles(cwd: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(cwd);
  } catch (err) {
    throw new Error(
      `Failed to read directory ${cwd}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const envFiles = entries.filter(name => {
    if (!name.startsWith('.env')) return false;
    const fullPath = path.join(cwd, name);
    try {
      return statSync(fullPath).isFile();
    } catch {
      return false;
    }
  });

  envFiles.sort((a, b) => {
    if (a === '.env') return -1;
    if (b === '.env') return 1;
    return a.localeCompare(b);
  });

  return envFiles;
}
