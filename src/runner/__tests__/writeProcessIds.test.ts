import {faker} from '@faker-js/faker';
import {ensureDir, readJson, remove} from 'fs-extra';
import path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {ProcessIdFileParsed} from '../types.js';
import {writeProcessIds} from '../writeProcessIds.js';

const kTestLocalFsDir = '.' + path.sep + 'testdir/writeProcessIds';
const testDir = path.join(kTestLocalFsDir + '/' + faker.number.int({min: 100}));

beforeAll(async () => {
  await ensureDir(testDir);
});

afterAll(async () => {
  await remove(testDir);
});

describe('writeProcessIds', () => {
  test('writes process ids', async () => {
    const filepath = path.join(
      testDir,
      faker.number.int({min: 100}).toString()
    );
    const pidList: ProcessIdFileParsed = [
      {name: faker.lorem.word(), pid: faker.number.int().toString()},
      {name: faker.lorem.word(), pid: faker.number.int().toString()},
    ];

    await writeProcessIds(pidList, {
      processIdFilepath: filepath,
    });

    const parsedPidFile = await readJson(filepath);
    expect(parsedPidFile).toEqual(expect.arrayContaining(pidList));
  });
});
