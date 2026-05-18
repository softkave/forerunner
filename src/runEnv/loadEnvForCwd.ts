import checkbox from '@inquirer/checkbox';
import {parse} from 'dotenv';
import {promises as fsp} from 'fs';
import path from 'path';
import {discoverEnvFiles} from './discoverEnvFiles.js';

export interface LoadEnvForCwdParams {
  cwd: string;
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
      `Failed to read ${envFilePath}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

/**
 * Loads and merges dotenv files in order; later files override earlier keys.
 */
export async function loadMergedEnvFromAbsolutePaths(
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

function orderSelectedBasenames(
  discoveryOrder: string[],
  selected: string[]
): string[] {
  const selectedSet = new Set(selected);
  return discoveryOrder.filter(b => selectedSet.has(b));
}

async function promptEnvBasenames(discoveryOrder: string[]): Promise<string[]> {
  if (discoveryOrder.length === 1) {
    return discoveryOrder;
  }

  const selected = await checkbox({
    message:
      'Select env file(s) to load (Space = toggle, Enter = confirm; A = all, I = invert)',
    choices: discoveryOrder.map(name => ({
      name,
      value: name,
    })),
    required: true,
  });

  return orderSelectedBasenames(discoveryOrder, selected);
}

/**
 * Resolves environment variables from explicit env file paths and/or `.env*`
 * discovery in `cwd` (same rules as `run-env`).
 */
export async function loadEnvForCwd(
  params: LoadEnvForCwdParams
): Promise<{env: NodeJS.ProcessEnv; logLabels: string[]}> {
  const {cwd, envFilePaths} = params;

  if (envFilePaths && envFilePaths.length > 0) {
    const absolutePaths = resolveExplicitPathsToAbsolute(cwd, envFilePaths);
    return loadMergedEnvFromAbsolutePaths(absolutePaths);
  }

  const discovered = await discoverEnvFiles(cwd);
  if (discovered.length === 0) {
    throw new Error(
      `No .env* files found in ${cwd}. Create at least one file whose name starts with .env (e.g. .env, .env.local), or pass explicit files with -e/--env-file.`
    );
  }

  const chosenBasenames = await promptEnvBasenames(discovered);
  const absolutePaths = basenamesToAbsolutePaths(cwd, chosenBasenames);
  return loadMergedEnvFromAbsolutePaths(absolutePaths);
}
