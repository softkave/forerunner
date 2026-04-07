import select from '@inquirer/select';
import {spawn} from 'child_process';
import {parse} from 'dotenv';
import {readFileSync} from 'fs';
import path from 'path';
import type {IForeLogger} from '../utils/foreLogger/types.js';
import {discoverEnvFiles} from './discoverEnvFiles.js';

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

function resolveEnvFilePath(cwd: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
}

/**
 * Runs the given command with environment variables loaded from a user-selected
 * .env* file, or from explicit paths when `envFilePaths` is set. Discovers
 * .env* files in cwd when no explicit list is given, lets user pick one (or
 * uses the only one), then spawns the command with merged env and stdio
 * inherited.
 */
export async function runWithEnvMain(params: RunWithEnvParams): Promise<void> {
  const {cwd, command, silent = false, logger, envFilePaths} = params;

  let env: NodeJS.ProcessEnv;
  let logLabels: string[];

  if (envFilePaths && envFilePaths.length > 0) {
    env = {...process.env};
    logLabels = [];
    for (const p of envFilePaths) {
      const envFilePath = resolveEnvFilePath(cwd, p);
      let content: string;
      try {
        content = readFileSync(envFilePath, 'utf-8');
      } catch (err) {
        throw new Error(
          `Failed to read ${envFilePath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      const parsed = parse(content);
      env = {...env, ...parsed};
      logLabels.push(envFilePath);
    }
  } else {
    const envFiles = discoverEnvFiles(cwd);
    if (envFiles.length === 0) {
      throw new Error(
        `No .env* files found in ${cwd}. Create at least one file whose name starts with .env (e.g. .env, .env.local), or pass explicit files with -e/--env-file.`
      );
    }

    let selected: string;
    if (envFiles.length === 1) {
      selected = envFiles[0];
    } else {
      selected = await select({
        message: 'Select an env file',
        choices: envFiles.map(name => ({value: name, name})),
      });
    }

    const envFilePath = path.join(cwd, selected);
    let content: string;
    try {
      content = readFileSync(envFilePath, 'utf-8');
    } catch (err) {
      throw new Error(
        `Failed to read ${envFilePath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const parsed = parse(content);
    env = {...process.env, ...parsed};
    logLabels = [selected];
  }

  if (!silent) {
    for (const label of logLabels) {
      logger.log(`Using ${label}`);
    }
  }

  await new Promise<void>((resolve, reject) => {
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
