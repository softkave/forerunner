import {faker} from '@faker-js/faker';
import {ensureDir, readFile, remove, writeFile} from 'fs-extra';
import path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {cleanFile} from '../cleanFile.js';

const kTestLocalFsDir = '.' + path.sep + 'testdir/addIndexFile';
const testDir = path.join(kTestLocalFsDir + '/' + faker.number.int({min: 100}));

beforeAll(async () => {
  await ensureDir(testDir);
});

afterAll(async () => {
  await remove(testDir);
});

describe('cleanFile', () => {
  test('cleaned file', async () => {
    const filepath = path.join(
      testDir,
      faker.number.int({min: 100}).toString()
    );
    await writeFile(filepath, 'random content', 'utf-8');

    await cleanFile(filepath, {cwd: process.cwd()});

    const actualContent = await readFile(filepath, 'utf-8');
    expect(actualContent).toBe('');
  });
});
