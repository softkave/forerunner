import {spawn} from 'child_process';
import {PassThrough} from 'node:stream';
import type {IForeLogger} from '../utils/foreLogger/types.js';
import {loadEnvForCwd} from './loadEnvForCwd.js';
import {RunEnvCommandError} from './runEnvCommandError.js';

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

function toBuffer(chunk: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}

function buffersToUtf8(chunks: readonly Buffer[]): string {
  if (chunks.length === 0) return '';
  return Buffer.concat(chunks as readonly Uint8Array[]).toString('utf8');
}

function teeStream(
  chunks: Buffer[],
  destination: NodeJS.WriteStream
): PassThrough {
  const pass = new PassThrough();
  pass.on('data', (chunk: Buffer | Uint8Array) => {
    chunks.push(toBuffer(chunk));
  });
  pass.pipe(destination);
  return pass;
}

function spawnCommandWithCapturedOutput(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const child = spawn(command, [], {
      shell: true,
      cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
      env,
    });

    child.stdout?.pipe(teeStream(stdoutChunks, process.stdout));
    child.stderr?.pipe(teeStream(stderrChunks, process.stderr));

    child.on('error', err => reject(err));
    child.on('close', (code, signal) => {
      const stdout = buffersToUtf8(stdoutChunks);
      const stderr = buffersToUtf8(stderrChunks);

      if (signal) {
        reject(
          new RunEnvCommandError({
            command,
            cwd,
            signal,
            stdout,
            stderr,
          })
        );
        return;
      }

      if (code !== 0 && code !== null) {
        reject(
          new RunEnvCommandError({
            command,
            cwd,
            exitCode: code,
            stdout,
            stderr,
          })
        );
        return;
      }

      resolve();
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

  await spawnCommandWithCapturedOutput(command, cwd, env);
}

export {RunEnvCommandError} from './runEnvCommandError.js';
