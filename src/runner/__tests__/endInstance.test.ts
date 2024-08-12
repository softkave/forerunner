import {assert, describe, expect, test} from 'vitest';
import {ps} from 'zx';
import {runDummyServer} from '../../utils/dummyServer/run.js';
import {endProcess} from '../endInstance.js';

describe('endProcess', () => {
  test('process ended', async () => {
    const {p} = runDummyServer();

    const pid = p.child?.pid;
    assert(pid);
    let entries = await ps.lookup({pid});
    expect(entries).toHaveLength(1);

    await endProcess(pid, {cwd: process.cwd()});

    entries = await ps.lookup({pid});
    expect(entries).toHaveLength(0);
  });
});
