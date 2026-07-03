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

/**
 * Runs a one-off container as root with a host directory bind-mounted
 * read-write, typically to adjust ownership/modes on files used by that image
 * at runtime.
 */
export async function runDockerOneOffAsRoot(params: {
  image: string;
  hostBindPath: string;
  containerMountPath: string;
  shellCommand: string;
}): Promise<void> {
  const {image, hostBindPath, containerMountPath, shellCommand} = params;
  await execFileAsync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${hostBindPath}:${containerMountPath}:rw`,
      '-u',
      'root',
      image,
      'sh',
      '-c',
      shellCommand,
    ],
    {encoding: 'utf8'}
  );
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

export async function dockerNetworkExists(
  networkName: string
): Promise<boolean> {
  try {
    await execFileAsync('docker', ['network', 'inspect', networkName], {
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

export async function ensureDockerNetwork(networkName: string): Promise<void> {
  if (await dockerNetworkExists(networkName)) {
    return;
  }

  try {
    await execFileAsync(
      'docker',
      ['network', 'create', '--driver', 'bridge', networkName],
      {encoding: 'utf8'}
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to create Docker network ${networkName}: ${msg}`);
  }
}

export async function removeDockerNetwork(networkName: string): Promise<void> {
  try {
    await execFileAsync('docker', ['network', 'rm', networkName], {
      encoding: 'utf8',
    });
  } catch {
    // Network may still have attached containers or already be removed.
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
