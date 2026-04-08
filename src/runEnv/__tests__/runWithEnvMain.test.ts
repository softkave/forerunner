import {ensureDir, rm, writeFile} from 'fs-extra';
import {readFile} from 'fs/promises';
import path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {runWithEnvMain} from '../runWithEnv.js';
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
});
