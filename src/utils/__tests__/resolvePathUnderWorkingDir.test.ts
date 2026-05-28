import path from 'path';
import {describe, expect, test} from 'vitest';
import {resolvePathUnderWorkingDir} from '../resolvePathUnderWorkingDir.js';

describe('resolvePathUnderWorkingDir', () => {
  test('returns absolute dirOrPath as-is', () => {
    const abs = path.resolve('/tmp/somewhere');
    expect(resolvePathUnderWorkingDir('work', abs)).toBe(abs);
  });

  test('joins simple relative path under workingDir', () => {
    const out = resolvePathUnderWorkingDir('work', 'mongo-data');
    expect(out).toBe(path.join(path.resolve('work'), 'mongo-data'));
  });

  test('does not double-prefix when dirOrPath already includes workingDir', () => {
    const out = resolvePathUnderWorkingDir(
      'work',
      path.join('work', 'mongo-data')
    );
    expect(out).toBe(path.join(path.resolve('work'), 'mongo-data'));
  });

  test('when dirOrPath equals workingDir, resolves to workingDir', () => {
    const out = resolvePathUnderWorkingDir('work', 'work');
    expect(out).toBe(path.resolve('work'));
  });

  test('does not strip similar prefixes (e.g. work vs workbench)', () => {
    const out = resolvePathUnderWorkingDir(
      'work',
      path.join('workbench', 'data')
    );
    expect(out).toBe(path.join(path.resolve('work'), 'workbench', 'data'));
  });

  test('handles trailing slashes in workingDir', () => {
    const out = resolvePathUnderWorkingDir(
      'work' + path.sep,
      path.join('work', 'mongo-data')
    );
    expect(out).toBe(path.join(path.resolve('work'), 'mongo-data'));
  });
});
