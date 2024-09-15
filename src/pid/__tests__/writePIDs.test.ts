import {faker} from '@faker-js/faker';
import {ensureDir, readJson, remove} from 'fs-extra';
import path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {ProcessIdFileParsed} from '../types.js';
import {writePIDs} from '../writePIDs.js';

const testDir = '.' + path.sep + 'testdir/writePIDs';

beforeAll(async () => {
  await ensureDir(testDir);
});

afterAll(async () => {
  await remove(testDir);
});

describe('writePIDs', () => {
  test('writes process ids', async () => {
    const filepath = path.join(
      testDir,
      faker.number.int({min: 100}).toString()
    );
    const pidList: ProcessIdFileParsed = [
      {name: faker.lorem.word(), pid: faker.number.int().toString()},
      {name: faker.lorem.word(), pid: faker.number.int().toString()},
    ];

    await writePIDs(pidList, {
      pidsFilepath: filepath,
    });

    const parsedPidFile = await readJson(filepath);
    expect(parsedPidFile).toEqual(expect.arrayContaining(pidList));
  });
});
