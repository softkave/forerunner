import {ChildProcess} from 'child_process';

export async function bufferProcessOutput(process: ChildProcess) {
  return new Promise<{stdout: string; stderr: string; code: number | null}>(
    resolve => {
      const stdoutBuffer: Buffer[] = [];
      const stderrBuffer: Buffer[] = [];

      process.stdout?.on('data', chunk => stdoutBuffer.push(chunk));
      process.stderr?.on('data', chunk => stderrBuffer.push(chunk));
      process.on('exit', code => {
        resolve({
          code,
          stdout: stdoutBuffer.map(chunk => chunk.toString()).join(''),
          stderr: stderrBuffer.map(chunk => chunk.toString()).join(''),
        });
      });
    }
  );
}
