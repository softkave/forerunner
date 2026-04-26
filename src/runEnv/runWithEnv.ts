import checkbox from '@inquirer/checkbox';
import {spawn} from 'child_process';
import {parse} from 'dotenv';
import {promises as fsp} from 'fs';
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

async function readEnvFileUtf8(envFilePath: string): Promise<string> {
  try {
    return await fsp.readFile(envFilePath, 'utf-8');
  } catch (err) {
    throw new Error(
      `Failed to read ${envFilePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Loads and merges dotenv files in order; later files override earlier keys.
 */
async function loadMergedEnvFromAbsolutePaths(
  absolutePaths: string[]
): Promise<{
  env: NodeJS.ProcessEnv;
  logLabels: string[];
}> {
  let env: NodeJS.ProcessEnv = {...process.env};
  const logLabels: string[] = [];

  for (const envFilePath of absolutePaths) {
    const content = await readEnvFileUtf8(envFilePath);
    const parsed = parse(content);
    env = {...env, ...parsed};
    logLabels.push(envFilePath);
  }

  return {env, logLabels};
}

function resolveExplicitPathsToAbsolute(
  cwd: string,
  paths: string[]
): string[] {
  return paths.map(p => resolveEnvFilePath(cwd, p));
}

function basenamesToAbsolutePaths(cwd: string, basenames: string[]): string[] {
  return basenames.map(b => path.join(cwd, b));
}

/**
 * Keeps merge order aligned with discovery order regardless of how the user
 * toggled checkboxes.
 */
function orderSelectedBasenames(
  discoveryOrder: string[],
  selected: string[]
): string[] {
  const selectedSet = new Set(selected);
  return discoveryOrder.filter(b => selectedSet.has(b));
}

/**
 * When several `.env*` files exist, prompts for a subset. Space toggles a row,
 * Enter confirms.
 */
async function promptEnvBasenames(discoveryOrder: string[]): Promise<string[]> {
  if (discoveryOrder.length === 1) {
    return discoveryOrder;
  }

  const selected = await checkbox({
    message:
      'Select env file(s) to load (Space = toggle, Enter = confirm; A = all, I = invert)',
    choices: discoveryOrder.map((name, index) => ({
      name,
      value: name,
    })),
    required: true,
  });

  return orderSelectedBasenames(discoveryOrder, selected);
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

  let env: NodeJS.ProcessEnv;
  let logLabels: string[];

  if (envFilePaths && envFilePaths.length > 0) {
    const absolutePaths = resolveExplicitPathsToAbsolute(cwd, envFilePaths);
    ({env, logLabels} = await loadMergedEnvFromAbsolutePaths(absolutePaths));
  } else {
    const discovered = await discoverEnvFiles(cwd);
    if (discovered.length === 0) {
      throw new Error(
        `No .env* files found in ${cwd}. Create at least one file whose name starts with .env (e.g. .env, .env.local), or pass explicit files with -e/--env-file.`
      );
    }

    const chosenBasenames = await promptEnvBasenames(discovered);
    const absolutePaths = basenamesToAbsolutePaths(cwd, chosenBasenames);
    ({env, logLabels} = await loadMergedEnvFromAbsolutePaths(absolutePaths));
  }

  if (!silent) {
    for (const label of logLabels) {
      logger.log(`Using ${label}`);
    }
  }

  await spawnCommandInherit(command, cwd, env);
}
