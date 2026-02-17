import {execFileSync} from 'child_process';

export function containerExists(containerName: string): boolean {
  try {
    execFileSync('docker', ['inspect', '-f', '{{.Id}}', containerName], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

export function isContainerRunning(containerName: string): boolean {
  try {
    const out = execFileSync(
      'docker',
      ['inspect', '-f', '{{.State.Running}}', containerName],
      {stdio: 'pipe', encoding: 'utf8'}
    );
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

export function volumeExists(volumeName: string): boolean {
  try {
    execFileSync('docker', ['volume', 'inspect', volumeName], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

export function ensureDockerAvailable(): void {
  try {
    execFileSync('docker', ['info'], {stdio: 'pipe', encoding: 'utf8'});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Docker is not available. Please ensure Docker is installed and running: ${msg}`
    );
  }
}

export function execInContainer(
  containerName: string,
  command: string[]
): string {
  return execFileSync('docker', ['exec', containerName, ...command], {
    stdio: 'pipe',
    encoding: 'utf8',
  }).trim();
}
