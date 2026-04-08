import {ensureDir, rm, writeFile} from 'fs-extra';
import {readFile} from 'fs/promises';
import path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {spawn} from 'child_process';

const testDir = path.join(process.cwd(), 'testdir', 'bin', 'run-env');

function runCli(
  args: string[],
  cwd: string
): Promise<{exitCode: number | null}> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['-y', 'tsx', 'src/bin.ts', ...args], {
      cwd,
      stdio: 'ignore',
      env: process.env,
    });

    child.on('error', err => reject(err));
    child.on('close', code => resolve({exitCode: code}));
  });
}

beforeAll(async () => {
  await ensureDir(testDir);
});

afterAll(async () => {
  await rm(path.join(process.cwd(), 'testdir'), {recursive: true, force: true});
});

describe('bin run-env', () => {
  test('runs the command with env vars from -e/--env-file (non-interactive)', async () => {
    const dir = path.join(testDir, 'explicit-env-files');
    await ensureDir(dir);

    await writeFile(
      path.join(dir, '.env'),
      ['FOO=from-env', 'SHARED=from-base'].join('\n'),
      'utf-8'
    );
    await writeFile(
      path.join(dir, '.env.local'),
      ['BAR=from-local', 'SHARED=from-local'].join('\n'),
      'utf-8'
    );

    // run-env passes the command after `--` as a single string; keep it simple.
    const command = [
      'node',
      '-e',
      `"require('fs').writeFileSync('out.txt', [process.env.FOO, process.env.BAR, process.env.SHARED].join('|'), 'utf-8')"`,
    ].join(' ');

    const {exitCode} = await runCli(
      ['run-env', '-w', dir, '-e', '.env', '-e', '.env.local', '--', command],
      process.cwd()
    );

    expect(exitCode).toBe(0);

    const out = await readFile(path.join(dir, 'out.txt'), 'utf-8');
    expect(out).toBe('from-env|from-local|from-local');
  });
});
