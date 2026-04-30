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

export async function removeVolume(volumeName: string): Promise<void> {
  try {
    await execFileAsync('docker', ['volume', 'rm', volumeName], {
      encoding: 'utf8',
    });
  } catch {
    // ignore
  }
}

/**
 * Create the volume if it does not exist. If `keep=false` and the volume exists,
 * it is removed and recreated (useful for ephemeral dev/test runs).
 */
export async function ensureVolume(params: {
  volumeName: string;
  keep: boolean;
}): Promise<void> {
  const {volumeName, keep} = params;
  const exists = await volumeExists(volumeName);

  if (!keep && exists) {
    await removeVolume(volumeName);
  }

  if (!(await volumeExists(volumeName))) {
    await execFileAsync('docker', ['volume', 'create', volumeName], {
      encoding: 'utf8',
    });
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

export async function networkExists(networkName: string): Promise<boolean> {
  try {
    await execFileAsync('docker', ['network', 'inspect', networkName], {
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

export async function ensureNetwork(networkName: string): Promise<void> {
  if (await networkExists(networkName)) return;
  await execFileAsync('docker', ['network', 'create', networkName], {
    encoding: 'utf8',
  });
}

export async function removeNetwork(networkName: string): Promise<void> {
  try {
    await execFileAsync('docker', ['network', 'rm', networkName], {
      encoding: 'utf8',
    });
  } catch {
    // ignore
  }
}
