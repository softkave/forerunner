import {spawn} from 'child_process';

export async function getProcessGroupId(
  pid: number
): Promise<string | undefined> {
  if (!pid) return undefined;
  if (process.platform === 'win32') return undefined;
  return await new Promise(resolve => {
    const child = spawn('bash', ['-lc', `ps -o pgid= -p ${pid} | tr -d ' '`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout?.on('data', d => (out += d.toString()));
    child.on('close', () => resolve(out.trim() || undefined));
    child.on('error', () => resolve(undefined));
  });
}
