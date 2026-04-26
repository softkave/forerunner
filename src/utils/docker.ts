import {execFile} from 'child_process';
import {promisify} from 'util';

const execFileAsync = promisify(execFile);

export async function containerExists(containerName: string): Promise<boolean> {
  try {
    await execFileAsync('docker', ['inspect', '-f', '{{.Id}}', containerName], {
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

export async function isContainerRunning(
  containerName: string
): Promise<boolean> {
  try {
    const {stdout} = await execFileAsync(
      'docker',
      ['inspect', '-f', '{{.State.Running}}', containerName],
      {encoding: 'utf8'}
    );
    return String(stdout).trim() === 'true';
  } catch {
    return false;
  }
}

export async function volumeExists(volumeName: string): Promise<boolean> {
  try {
    await execFileAsync('docker', ['volume', 'inspect', volumeName], {
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

export async function ensureDockerAvailable(): Promise<void> {
  try {
    await execFileAsync('docker', ['info'], {encoding: 'utf8'});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Docker is not available. Please ensure Docker is installed and running: ${msg}`
    );
  }
}

export async function execInContainer(
  containerName: string,
  command: string[]
): Promise<string> {
  const {stdout} = await execFileAsync(
    'docker',
    ['exec', containerName, ...command],
    {encoding: 'utf8'}
  );
  return String(stdout).trim();
}
