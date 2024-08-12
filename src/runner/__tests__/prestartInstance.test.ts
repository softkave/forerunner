import {describe, expect, test} from 'vitest';
import {getDummyProcessCmd} from '../../utils/dummyProcess/run.js';
import {prestartInstance, prestartInstanceList} from '../prestartInstance.js';

describe('prestartInstanceList', () => {
  test('runs prestart', async () => {
    const msg = 'hello, world!';
    const {cmd} = getDummyProcessCmd({args: [msg]});

    const p = await prestartInstanceList({
      cwd: process.cwd(),
      prestartCmd: cmd,
    });
    const stdout = p?.stdout || '';

    expect(stdout).toBe(msg);
  });
});

describe('prestartInstance', () => {
  test('runs instance prestart', async () => {
    const msg = 'hello, world!';
    const {cmd} = getDummyProcessCmd({args: [msg]});

    const p = await prestartInstance(
      /** instance */ {prestartCmd: cmd},
      /** opts */ {cwd: process.cwd()}
    );
    const stdout = p?.stdout || '';

    expect(stdout).toBe(msg);
  });
});
