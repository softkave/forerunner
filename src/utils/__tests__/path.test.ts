import path from 'path';
import {describe, expect, test} from 'vitest';
import {getFimidaraFilepath, getLocalFilepath} from '../path.js';

describe('getLocalFilepath', () => {
  test('absolute path', () => {
    const posixAbslPath = '/root/folder/file';

    const p = getLocalFilepath(posixAbslPath, {filesBasepath: '/another-root'});

    expect(p).toBe(posixAbslPath);
  });

  test('relative path with base', () => {
    const posixPath = 'not-root/folder/file';
    const fRoot = '/root';

    const p = getLocalFilepath(posixPath, {filesBasepath: fRoot});

    expect(p).toBe(path.join(fRoot, posixPath));
  });

  test('relative path without base', () => {
    const posixPath = 'not-root/folder/file';

    const p = getLocalFilepath(posixPath, {});

    expect(p).toBe(posixPath);
  });
});

describe('getFimidaraFilepath', () => {
  test('absolute path', () => {
    const posixAbslPath = '/root/folder/file';

    const p = getFimidaraFilepath(posixAbslPath, {
      fimidaraBasepath: '/another-root',
    });

    expect(p).toBe(posixAbslPath);
  });

  test('relative path with base', () => {
    const posixPath = 'not-root/folder/file';
    const fRoot = '/root';

    const p = getFimidaraFilepath(posixPath, {fimidaraBasepath: fRoot});

    expect(p).toBe(path.join(fRoot, posixPath));
  });

  test('relative path without base', () => {
    const posixPath = 'not-root/folder/file';

    const p = getFimidaraFilepath(posixPath, {});

    expect(p).toBe(posixPath);
  });
});
