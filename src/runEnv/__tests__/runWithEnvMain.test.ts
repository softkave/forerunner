import {ensureDir, rm, writeFile} from 'fs-extra';
import {readFile} from 'fs/promises';
import path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {RunEnvCommandError, runWithEnvMain} from '../runWithEnv.js';
import {NoopForeLogger} from '../../utils/exports.js';

const testDir = path.join(process.cwd(), 'testdir', 'runEnv', 'runWithEnvMain');

const silentLogger = new NoopForeLogger();

beforeAll(async () => {
  await ensureDir(testDir);
});

afterAll(async () => {
  await rm(path.join(process.cwd(), 'testdir'), {recursive: true, force: true});
});

describe('runWithEnvMain', () => {
  test('when envFilePaths is provided (non-interactive), runs the command with env vars from those files (later overrides earlier)', async () => {
    const dir = path.join(testDir, 'explicit-env-files');
    await ensureDir(dir);

    // Base file
    await writeFile(
      path.join(dir, '.env'),
      ['FOO=from-env', 'SHARED=from-base'].join('\n'),
      'utf-8'
    );
    // Override file
    await writeFile(
      path.join(dir, '.env.local'),
      ['BAR=from-local', 'SHARED=from-local'].join('\n'),
      'utf-8'
    );

    const outFile = path.join(dir, 'out.txt');
    const command = [
      'node',
      '-e',
      `"require('fs').writeFileSync('out.txt', [process.env.FOO, process.env.BAR, process.env.SHARED].join('|'), 'utf-8')"`,
    ].join(' ');

    await runWithEnvMain({
      cwd: dir,
      command,
      silent: true,
      logger: silentLogger,
      envFilePaths: ['.env', '.env.local'],
    });

    const out = await readFile(outFile, 'utf-8');
    expect(out).toBe('from-env|from-local|from-local');
  });

  test('when the command fails, throws RunEnvCommandError with exit code and captured output', async () => {
    const dir = path.join(testDir, 'command-failure');
    await ensureDir(dir);
    await writeFile(path.join(dir, '.env'), 'FOO=bar\n', 'utf-8');

    try {
      await runWithEnvMain({
        cwd: dir,
        command:
          'node -e "process.stderr.write(\\"migration failed: connection refused\\n\\"); process.exit(3)"',
        silent: true,
        logger: silentLogger,
      });
      expect.fail('expected RunEnvCommandError');
    } catch (error) {
      expect(error).toBeInstanceOf(RunEnvCommandError);
      const cmdError = error as RunEnvCommandError;
      expect(cmdError.exitCode).toBe(3);
      expect(cmdError.output).toBe('migration failed: connection refused');
      expect(cmdError.message).toContain('Command failed (exit 3)');
      expect(cmdError.message).toContain(
        'migration failed: connection refused'
      );
    }
  });
});
