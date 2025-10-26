import {exec} from 'child_process';
import {promisify} from 'util';

const execAsync = promisify(exec);

/**
 * Recursively finds all child PIDs of a given parent PID. This function uses
 * `pgrep -P` to get child processes, which works on both Linux and macOS.
 *
 * @param parentPid - The parent process ID to find children for
 * @returns Promise that resolves to array of all descendant PIDs
 * @throws Error if not running on Linux/macOS or if the process doesn't exist
 */
export async function findChildrenPIDs(parentPid: number): Promise<number[]> {
  // Check if running on Linux or macOS
  if (process.platform !== 'linux' && process.platform !== 'darwin') {
    throw new Error('findChildrenPIDs only works on Linux and macOS systems');
  }

  const children: number[] = [];

  try {
    // Use pgrep -P to get direct children of the parent PID
    const {stdout} = await execAsync(`pgrep -P ${parentPid}`);

    // Parse the output (newline-separated PIDs)
    const childPids = stdout
      .trim()
      .split('\n')
      .filter(pid => pid.length > 0);

    for (const childPidStr of childPids) {
      const childPid = parseInt(childPidStr, 10);
      if (!isNaN(childPid)) {
        children.push(childPid);
        // Recursively find children of this child
        const grandChildren = await findChildrenPIDs(childPid);
        children.push(...grandChildren);
      }
    }
  } catch (error) {
    // If pgrep fails (no children found or process doesn't exist),
    // we don't throw an error as it's normal for processes to have no children
    // Only throw if it's a different type of error
    if (error instanceof Error && !error.message.includes('Command failed')) {
      throw new Error(
        `Failed to find children for PID ${parentPid}: ${error.message}`
      );
    }
  }

  return children;
}
