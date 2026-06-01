export class RunEnvCommandError extends Error {
  readonly command: string;
  readonly cwd: string;
  readonly exitCode?: number;
  readonly signal?: NodeJS.Signals;
  readonly output: string;

  constructor(params: {
    command: string;
    cwd: string;
    exitCode?: number;
    signal?: NodeJS.Signals;
    stdout?: string;
    stderr?: string;
  }) {
    const {command, cwd, exitCode, signal, stdout = '', stderr = ''} = params;
    const output = RunEnvCommandError.formatCapturedOutput(stdout, stderr);
    super(
      RunEnvCommandError.formatMessage({
        command,
        cwd,
        exitCode,
        signal,
        output,
      })
    );
    this.name = 'RunEnvCommandError';
    this.command = command;
    this.cwd = cwd;
    this.exitCode = exitCode;
    this.signal = signal;
    this.output = output;
  }

  private static stripAnsi(text: string): string {
    return text.replace(/\u001b\[[0-9;]*m/g, '');
  }

  private static formatCapturedOutput(stdout: string, stderr: string): string {
    const combined = [stdout, stderr]
      .map(part => RunEnvCommandError.stripAnsi(part).trim())
      .filter(Boolean)
      .join('\n')
      .trim();
    return combined;
  }

  private static formatMessage(params: {
    command: string;
    cwd: string;
    exitCode?: number;
    signal?: NodeJS.Signals;
    output: string;
  }): string {
    const {command, cwd, exitCode, signal, output} = params;
    const lines: string[] = [];

    if (signal) {
      lines.push(`Command terminated by signal ${signal}: ${command}`);
    } else {
      lines.push(`Command failed (exit ${exitCode ?? '?'}): ${command}`);
    }
    lines.push(`cwd: ${cwd}`);

    if (output) {
      lines.push('', '--- command output ---', output);
    } else {
      lines.push('', 'The command produced no captured output.');
    }

    return lines.join('\n');
  }
}
