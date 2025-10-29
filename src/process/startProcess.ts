import {spawn} from 'child_process';
import {ensureFile, pathExists} from 'fs-extra';
import {access, constants} from 'fs/promises';
import path from 'path';
import {writePIDs} from '../pid/writePIDs.js';
import {cleanFile} from '../utils/cleanFile.js';
import {nowISO} from '../utils/dateTime.js';
import {IInstanceOpts, IRunnerOpts} from './types.js';

async function canExecute(filepath: string): Promise<boolean> {
  try {
    await access(filepath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function executeScriptWithSetsid(
  scriptPath: string,
  cwd: string,
  env: Record<string, any>,
  logsFilepath: string,
  errorLogsFilepath: string
): Promise<{pid: string; pgid: string}> {
  // Check if script is executable
  const isExecutable = await canExecute(scriptPath);

  // Use a more sophisticated approach: create a process group using bash job control
  const bashCommand = `
    # Start the process in background and capture its PID
    ${isExecutable ? scriptPath : `bash ${scriptPath}`} > "${logsFilepath}" 2> "${errorLogsFilepath}" &
    SCRIPT_PID=$!
    
    # Wait a moment for the process to start
    sleep 0.2
    
    # Get the process group ID
    PGID=$(ps -o pgid= $SCRIPT_PID 2>/dev/null | tr -d ' ')
    
    # If PGID is empty, try alternative method
    if [ -z "$PGID" ]; then
      PGID=$(ps -o pgid= -p $SCRIPT_PID 2>/dev/null | tr -d ' ')
    fi
    
    echo "PID:$SCRIPT_PID,PGID:$PGID"
  `;

  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', bashCommand], {
      cwd,
      env: {...process.env, ...env},
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    let output = '';
    let errorOutput = '';

    child.stdout?.on('data', data => {
      output += data.toString();
    });

    child.stderr?.on('data', data => {
      errorOutput += data.toString();
    });

    child.on('close', code => {
      if (code === 0) {
        // Parse the output to extract PID and PGID
        const match = output.match(/PID:(\d+),PGID:(\d+)/);
        if (match) {
          const pid = match[1];
          const pgid = match[2];
          if (!pgid || pgid === '') {
            reject(new Error(`PGID is empty in output: ${output}`));
            return;
          }
          resolve({pid, pgid});
        } else {
          reject(
            new Error(`Failed to parse PID and PGID from output: ${output}`)
          );
        }
      } else {
        reject(
          new Error(`Script execution failed with code ${code}: ${errorOutput}`)
        );
      }
    });

    child.on('error', reject);
  });
}

async function ensureOrClean(f: string, opts: Pick<IRunnerOpts, 'cwd'>) {
  if (await pathExists(f)) {
    await cleanFile(f, opts);
  } else {
    await ensureFile(f);
  }
}

/**
 * Starts a process with its own process group ID (PGID) for proper cleanup
 * management.
 *
 * The process is started in its own process group, which allows for clean
 * termination of the entire process tree should the parent process die
 * unexpectedly. The PGID is written to the pidsFilepath along with the PID,
 * enabling cleanup operations that can terminate all processes in the group
 * using the PGID.
 *
 * Processes that should not be automatically reaped (e.g., long-running
 * services that should persist beyond the parent process lifecycle) can set a
 * different PGID when they start to avoid being terminated during cleanup
 * operations.
 *
 * @param instance - Configuration options for the process instance
 * @returns Promise resolving to an object containing the process PID, PGID, and
 * log file paths
 * @throws Error if script execution fails or PID/PGID parsing fails
 */
export async function startProcess(instance: IInstanceOpts) {
  const logsFilenameSuffix = `${instance.runName}-${nowISO()}`;
  const logsFilename = `log-${logsFilenameSuffix}`;
  const errorLogsFilename = `error-${logsFilenameSuffix}`;

  const logsFilepath = path.join(instance.logsFolderpath, logsFilename);
  const errorLogsFilepath = path.join(
    instance.logsFolderpath,
    errorLogsFilename
  );

  await Promise.all([
    ensureOrClean(logsFilepath, instance),
    ensureOrClean(errorLogsFilepath, instance),
  ]);

  // Execute script using bash with setsid and capture PID/PGID using $!
  const {pid, pgid} = await executeScriptWithSetsid(
    instance.startCmdFilepath,
    instance.cwd || process.cwd(),
    instance.env || {},
    logsFilepath,
    errorLogsFilepath
  );

  if (instance.pidsFilepath) {
    await writePIDs([{pid, name: instance.name, pgid}], {
      pidsFilepath: instance.pidsFilepath,
    });
  }

  return {pid, pgid, logsFilepath, errorLogsFilepath};
}
