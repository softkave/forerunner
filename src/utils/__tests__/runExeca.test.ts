import assert from 'assert';
import {describe, expect, test} from 'vitest';
import {ForerunnerExecaError} from '../errors.js';
import {runExeca} from '../runExeca.js';

describe('runExeca', () => {
  test('success', async () => {
    const text = 'hello, world!';

    const {stdout} = await runExeca(`echo ${text}`);

    expect(stdout).toBe(text);
  });

  test('fails', async () => {
    try {
      await runExeca('exit 1');
      assert.fail('should throw ForerunnerExecaError');
    } catch (error: unknown) {
      assert(error instanceof ForerunnerExecaError);
      expect(error.execaResult).toBeTruthy();
    }
  });
});
