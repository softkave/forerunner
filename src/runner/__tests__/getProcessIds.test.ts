import {faker} from '@faker-js/faker';
import {ensureDir, remove, writeFile} from 'fs-extra';
import path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {getProcessIds} from '../getProcessIds.js';
import {ProcessIdFileParsed} from '../types.js';

const kTestLocalFsDir = '.' + path.sep + 'testdir/getProcessIds';
const testDir = path.join(kTestLocalFsDir + '/' + faker.number.int({min: 100}));

beforeAll(async () => {
  await ensureDir(testDir);
});

afterAll(async () => {
  await remove(testDir);
});

describe('getProcessIds', () => {
  test('returns process ids', async () => {
    const filepath = path.join(
      testDir,
      faker.number.int({min: 100}).toString()
    );
    const pidList: ProcessIdFileParsed = [
      {name: faker.lorem.word(), pid: faker.number.int().toString()},
      {name: faker.lorem.word(), pid: faker.number.int().toString()},
    ];
    await writeFile(filepath, JSON.stringify(pidList), 'utf-8');

    const {pids, pidsByName} = await getProcessIds({
      processIdFilepath: filepath,
    });

    expect(pids).toEqual(expect.arrayContaining(pidList));
    pidList.forEach(pid => expect(pidsByName[pid.name]).toEqual(pid));
  });
});
