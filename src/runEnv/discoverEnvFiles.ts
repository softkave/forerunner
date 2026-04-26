import {promises as fsp} from 'fs';
import path from 'path';

/**
 * Discovers all files in the given directory whose names start with `.env`.
 * Returns only files (not directories), sorted with `.env` first, then
 * alphabetically.
 */
export async function discoverEnvFiles(cwd: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fsp.readdir(cwd);
  } catch (err) {
    throw new Error(
      `Failed to read directory ${cwd}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const checks = await Promise.all(
    entries.map(async name => {
      if (!name.startsWith('.env')) return {name, isEnv: false};
      const fullPath = path.join(cwd, name);
      try {
        const st = await fsp.stat(fullPath);
        return {name, isEnv: st.isFile()};
      } catch {
        return {name, isEnv: false};
      }
    })
  );

  const envFiles = checks.filter(x => x.isEnv).map(x => x.name);

  envFiles.sort((a, b) => {
    if (a === '.env') return -1;
    if (b === '.env') return 1;
    return a.localeCompare(b);
  });

  return envFiles;
}
