import {spawn} from 'child_process';
import type {IForeLogger} from '../utils/foreLogger/types.js';
import {loadEnvForCwd} from './loadEnvForCwd.js';

export interface RunWithEnvParams {
  cwd: string;
  command: string;
  silent?: boolean;
  logger: IForeLogger;
  /**
   * When non-empty, load these files in order (later overrides earlier) and
   * skip discovery / interactive selection. Paths are relative to `cwd` unless
   * absolute.
   */
  envFilePaths?: string[];
}

function spawnCommandInherit(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, [], {
      shell: true,
      cwd,
      stdio: 'inherit',
      env,
    });

    child.on('error', err => reject(err));
    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`Command terminated by signal: ${signal}`));
      } else if (code !== 0 && code !== null) {
        reject(new Error(`Command exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Runs the given command with environment variables loaded from `.env*` files.
 * Use explicit `envFilePaths` to skip discovery; otherwise files are discovered
 * in `cwd`, and when more than one exists the user picks any subset via a
 * checkbox prompt (merge order follows discovery order among selected files).
 */
export async function runWithEnvMain(params: RunWithEnvParams): Promise<void> {
  const {cwd, command, silent = false, logger, envFilePaths} = params;

  const {env, logLabels} = await loadEnvForCwd({
    cwd,
    envFilePaths,
  });

  if (!silent) {
    for (const label of logLabels) {
      logger.log(`Using ${label}`);
    }
  }

  await spawnCommandInherit(command, cwd, env);
}
