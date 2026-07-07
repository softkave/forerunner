import {afterEach, describe, expect, test, vi} from 'vitest';

const {spawnMock, loadEnvForCwdMock} = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  loadEnvForCwdMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('../loadEnvForCwd.js', () => ({
  loadEnvForCwd: loadEnvForCwdMock,
}));

const stdinTTYDescriptor = Object.getOwnPropertyDescriptor(
  process.stdin,
  'isTTY'
);
const stdoutTTYDescriptor = Object.getOwnPropertyDescriptor(
  process.stdout,
  'isTTY'
);
const stderrTTYDescriptor = Object.getOwnPropertyDescriptor(
  process.stderr,
  'isTTY'
);

afterEach(() => {
  spawnMock.mockReset();
  loadEnvForCwdMock.mockReset();

  if (stdinTTYDescriptor) {
    Object.defineProperty(process.stdin, 'isTTY', stdinTTYDescriptor);
  }
  if (stdoutTTYDescriptor) {
    Object.defineProperty(process.stdout, 'isTTY', stdoutTTYDescriptor);
  }
  if (stderrTTYDescriptor) {
    Object.defineProperty(process.stderr, 'isTTY', stderrTTYDescriptor);
  }
});

describe('runWithEnvMain TTY handling', () => {
  test('uses inherited stdio when the parent process has a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });

    loadEnvForCwdMock.mockResolvedValue({
      env: {FOO: 'bar'},
      logLabels: ['.env'],
    });

    const child: {on: ReturnType<typeof vi.fn>} = {
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        if (event === 'close') {
          queueMicrotask(() => handler(0, null));
        }
        return child;
      }),
    };

    spawnMock.mockReturnValue(child as any);

    const {runWithEnvMain} = await import('../runWithEnv.js');

    await runWithEnvMain({
      cwd: '/tmp/project',
      command: 'node -v',
      silent: true,
      logger: {log: vi.fn(), error: vi.fn()} as any,
    });

    expect(spawnMock).toHaveBeenCalledWith(
      'node -v',
      [],
      expect.objectContaining({
        cwd: '/tmp/project',
        env: {FOO: 'bar'},
        shell: true,
        stdio: 'inherit',
      })
    );
  });
});
