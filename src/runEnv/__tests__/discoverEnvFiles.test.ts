import {ensureDir, mkdir, rm, writeFile} from 'fs-extra';
import path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {discoverEnvFiles} from '../discoverEnvFiles.js';

const testDir = path.join(
  process.cwd(),
  'testdir',
  'runEnv',
  'discoverEnvFiles'
);

beforeAll(async () => {
  await ensureDir(testDir);
});

afterAll(async () => {
  await rm(path.join(process.cwd(), 'testdir'), {recursive: true, force: true});
});

describe('discoverEnvFiles', () => {
  test('returns only files starting with .env and excludes directories', async () => {
    const dir = path.join(testDir, 'files-and-dirs');
    await ensureDir(dir);
    await writeFile(path.join(dir, '.env'), 'A=1', 'utf-8');
    await writeFile(path.join(dir, '.env.local'), 'B=2', 'utf-8');
    await writeFile(path.join(dir, '.env.foo'), 'C=3', 'utf-8');
    await mkdir(path.join(dir, '.env.d'), {recursive: true});
    await writeFile(path.join(dir, 'other'), 'x', 'utf-8');

    const result = discoverEnvFiles(dir);

    expect(result).toContain('.env');
    expect(result).toContain('.env.local');
    expect(result).toContain('.env.foo');
    expect(result).not.toContain('.env.d');
    expect(result).not.toContain('other');
    expect(result[0]).toBe('.env');
    expect(result).toHaveLength(3);
  });

  test('sorts with .env first then alphabetically', async () => {
    const dir = path.join(testDir, 'sort');
    await ensureDir(dir);
    await writeFile(path.join(dir, '.env.z'), 'z', 'utf-8');
    await writeFile(path.join(dir, '.env.a'), 'a', 'utf-8');
    await writeFile(path.join(dir, '.env'), 'base', 'utf-8');

    const result = discoverEnvFiles(dir);

    expect(result).toEqual(['.env', '.env.a', '.env.z']);
  });

  test('returns empty array when no .env* files exist', async () => {
    const emptyDir = path.join(testDir, 'empty');
    await ensureDir(emptyDir);

    const result = discoverEnvFiles(emptyDir);

    expect(result).toEqual([]);
  });

  test('throws when directory does not exist', () => {
    expect(() => discoverEnvFiles(path.join(testDir, 'nonexistent'))).toThrow(
      /Failed to read directory/
    );
  });
});
