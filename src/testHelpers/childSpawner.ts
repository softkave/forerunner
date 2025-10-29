import {ChildProcess, spawn} from 'child_process';
import {Command} from 'commander';
import fse from 'fs-extra';
import {glob} from 'fs/promises';
import getPort from 'get-port';
import http from 'http';
import path from 'path';
import {getPIDsFromFile} from '../pid/getPIDs.js';
import {IProcessIdItem} from '../pid/types.js';
import {writePIDs} from '../pid/writePIDs.js';
import {newDummyServer} from '../utils/dummyServer/server.js';

// Message types for IPC communication
interface ReadyMessage {
  type: 'ready';
  processName: string;
  pid: number;
  pgid: number | undefined;
  childrenCount: number;
}

type ProcessMessage = ReadyMessage;

interface SpawnerConfig {
  childrenCount: number;
  depth: number;
  baseName: string;
  outputDir: string;
  position: number;
  parentPid: number;
}

interface ProcessArgs {
  childrenCount: number;
  depth: number;
  baseName: string;
  outputDir: string;
  position: number;
  parentPid: number;
}

/**
 * Gets the process group ID for the current process
 */
function getCurrentProcessGroupId(): number | undefined {
  try {
    // Use process.getgid() if available, otherwise fallback to process.pid
    if (typeof process.getgid === 'function') {
      return process.getgid();
    }
    return undefined;
  } catch (error) {
    console.error('Failed to get process group ID:', error);
    return undefined;
  }
}
function generateProcessName(
  baseName: string,
  depth: number,
  position: number
): string {
  return `${baseName}-d${depth}-p${position}`;
}

/**
 * Sends a message to the parent process via IPC
 */
function sendMessageToParent(message: ProcessMessage): void {
  if (process.send) {
    try {
      process.send(message);
    } catch (error) {
      console.error('Failed to send message to parent:', error);
    }
  } else {
    console.error('No parent process to send message to', process.pid);
  }
}

/**
 * Recursively finds all files ending with 'pids.json' in a directory using
 * `fs/promises` `glob`
 */
async function findPidFiles(directoryPath: string): Promise<string[]> {
  try {
    // Use glob to find all files ending with pids.json
    const pattern = path.join(directoryPath, '**', 'pids.json');
    const pidFiles: string[] = [];

    for await (const file of glob(pattern)) {
      pidFiles.push(file);
    }

    return pidFiles;
  } catch (error) {
    console.error(`Failed to find PID files in ${directoryPath}:`, error);
    return [];
  }
}

/**
 * Reads all PID files from a directory and returns combined array of
 * `IProcessIdItem`
 */
export async function readAllPIDsFromDirectory(
  directoryPath: string
): Promise<IProcessIdItem[]> {
  try {
    // Find all files ending with pids.json
    const pidFiles = await findPidFiles(directoryPath);

    console.log(
      `Found ${pidFiles.length} PID files in ${directoryPath}:`,
      pidFiles
    );

    const allPIDs: IProcessIdItem[] = [];

    // Read each PID file using the existing getPIDsFromFile function
    for (const pidFile of pidFiles) {
      try {
        const {pids} = await getPIDsFromFile({pidsFilepath: pidFile});
        allPIDs.push(...pids);
        console.log(`Read ${pids.length} PIDs from ${pidFile}`);
      } catch (error) {
        console.error(`Failed to read PID file ${pidFile}:`, error);
        // Continue with other files even if one fails
      }
    }

    console.log(`Total PIDs collected: ${allPIDs.length}`);
    return allPIDs;
  } catch (error) {
    console.error(
      `Failed to read PID files from directory ${directoryPath}:`,
      error
    );
    return [];
  }
}

/**
 * Parses command line arguments for the child spawner using Commander
 */
function parseProcessArgs(): ProcessArgs {
  const program = new Command();

  program
    .name('child-spawner')
    .description(
      'Spawns hierarchical child processes for testing PID management'
    )
    .version('1.0.0')
    .requiredOption('-c, --children <count>', 'Number of children to spawn')
    .requiredOption('-d, --depth <depth>', 'Depth of the process tree')
    .requiredOption('-n, --name <name>', 'Base name for processes')
    .requiredOption('-o, --output <dir>', 'Output directory for PID files')
    .option('-p, --position <pos>', 'Position among siblings', '0')
    .option(
      '--parent-pid <pid>',
      'Parent process ID',
      String(process.ppid || 0)
    )
    .parse();

  const options = program.opts();

  // Parse and validate numeric options
  const childrenCount = parseInt(options.children, 10);
  const depth = parseInt(options.depth, 10);
  const position = parseInt(options.position, 10);
  const parentPid = parseInt(options.parentPid, 10);

  if (
    isNaN(childrenCount) ||
    isNaN(depth) ||
    isNaN(position) ||
    isNaN(parentPid)
  ) {
    console.error('Invalid numeric arguments provided');
    process.exit(1);
  }

  if (childrenCount < 0 || depth < 0 || position < 0) {
    console.error('Children count, depth, and position must be non-negative');
    process.exit(1);
  }

  return {
    childrenCount,
    depth,
    baseName: options.name,
    outputDir: options.output,
    position,
    parentPid,
  };
}

/**
 * Writes the current process PID and PGID to a file for testing purposes
 */
async function writeCurrentProcessPid(config: SpawnerConfig): Promise<void> {
  const processName = generateProcessName(
    config.baseName,
    config.depth,
    config.position
  );
  const pgid = getCurrentProcessGroupId();
  const pidItem: IProcessIdItem = {
    name: processName,
    pid: process.pid.toString(),
    pgid: pgid?.toString(),
  };

  const pidsFilepath = path.join(config.outputDir, processName, 'pids.json');

  try {
    // Read existing PIDs if file exists
    let existingPids: IProcessIdItem[] = [];
    if (await fse.pathExists(pidsFilepath)) {
      existingPids = await fse.readJson(pidsFilepath);
    }

    // Add current PID and PGID
    existingPids.push(pidItem);

    // Write back to file
    await writePIDs(existingPids, {pidsFilepath});

    console.log(
      `[${processName}] Wrote PID ${process.pid} and PGID ${pgid} to ${pidsFilepath}`
    );
  } catch (error) {
    console.error(`[${processName}] Failed to write PID and PGID:`, error);
  }
}

/**
 * Spawns child processes recursively with IPC communication
 */
async function spawnChildren(config: SpawnerConfig): Promise<ChildProcess[]> {
  const children: ChildProcess[] = [];

  if (config.depth <= 0) {
    return children;
  }

  const processName = generateProcessName(
    config.baseName,
    config.depth,
    config.position
  );
  console.log(
    `[${processName}] Spawning ${config.childrenCount} children at depth ${config.depth}`
  );

  for (let i = 0; i < config.childrenCount; i++) {
    // Calculate globally unique position for this child
    // Position = (parent_position * children_count) + child_index
    const childPosition = config.position * config.childrenCount + i;

    const childConfig: SpawnerConfig = {
      childrenCount: config.childrenCount,
      depth: config.depth - 1,
      baseName: config.baseName,
      outputDir: config.outputDir,
      position: childPosition,
      parentPid: process.pid,
    };

    const childProcessName = generateProcessName(
      config.baseName,
      childConfig.depth,
      childConfig.position
    );

    // Spawn child process with IPC enabled using node --import=tsx
    const childProcess = spawn(
      'node',
      [
        '--import=tsx',
        process.argv[1], // This script path
        '--children',
        childConfig.childrenCount.toString(),
        '--depth',
        childConfig.depth.toString(),
        '--name',
        childConfig.baseName,
        '--output',
        childConfig.outputDir,
        '--position',
        childConfig.position.toString(),
        '--parent-pid',
        childConfig.parentPid.toString(),
      ],
      {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'], // Enable IPC
        detached: false,
        serialization: 'json',
      }
    );

    childProcess.on('error', error => {
      console.error(
        `[${processName}] Failed to spawn child ${childProcessName}:`,
        error
      );
    });

    childProcess.on('exit', (code, signal) => {
      console.log(
        `[${processName}] Child ${childProcessName} exited with code ${code}, signal ${signal}`
      );
    });

    children.push(childProcess);
    console.log(
      `[${processName}] Spawned child ${childProcessName} with PID ${childProcess.pid}`
    );
  }

  return children;
}

/**
 * Waits for children to be ready by listening for ready messages or exit events
 */
async function waitForChildrenReady(
  children: ChildProcess[],
  processName?: string
): Promise<void> {
  if (children.length === 0) {
    return;
  }

  if (processName) {
    console.log(
      `[${processName}] Waiting for ${children.length} children to be ready...`
    );
  }

  let readyCount = 0;

  // Wait for ready messages or exit events from all children
  const readyPromises = children.map(
    child =>
      new Promise<void>(resolve => {
        const handleReady = () => {
          readyCount++;
          if (processName) {
            console.log(
              `[${processName}] Child ready (${readyCount}/${children.length})`
            );
          }
          resolve();
        };

        // Listen for ready message
        child.on('message', (message: ProcessMessage) => {
          console.log('message from child', message);
          if (message.type === 'ready') {
            if (processName) {
              console.log(
                `[${processName}] Received ready message from ${message.processName} (PID: ${message.pid}, PGID: ${message.pgid}, children: ${message.childrenCount})`
              );
            }
            handleReady();
          }
        });

        // Listen for exit event (also counts as ready)
        child.on('exit', (code, signal) => {
          if (processName) {
            console.log(
              `[${processName}] Child exited (code: ${code}, signal: ${signal}) - counting as ready`
            );
          }
          handleReady();
        });

        // Listen for error event
        child.on('error', error => {
          if (processName) {
            console.error(`[${processName}] Child error:`, error);
          }
        });
      })
  );

  await Promise.all(readyPromises);
  if (processName) {
    console.log(
      `[${processName}] All children are ready (${readyCount}/${children.length})`
    );
  }
}

/**
 * Forwards kill signals to all children processes
 */
function setupSignalForwarding(
  children: ChildProcess[],
  processName: string
): void {
  const forwardSignal = (signal: string) => {
    console.log(
      `[${processName}] Received ${signal}, forwarding to ${children.length} children...`
    );

    children.forEach((child, index) => {
      if (child.pid && !child.killed) {
        try {
          console.log(
            `[${processName}] Sending ${signal} to child ${index + 1} (PID: ${child.pid})`
          );
          process.kill(child.pid, signal);
        } catch (error) {
          console.error(
            `[${processName}] Failed to send ${signal} to child ${index + 1}:`,
            error
          );
        }
      }
    });
  };

  // Handle SIGTERM
  process.on('SIGTERM', () => {
    console.log(
      `[${processName}] Received SIGTERM, shutting down gracefully...`
    );
    forwardSignal('SIGTERM');

    // Give children time to clean up, then force exit
    setTimeout(() => {
      console.log(`[${processName}] Force exiting after SIGTERM`);
      process.exit(0);
    }, 5000);
  });

  // Handle SIGINT
  process.on('SIGINT', () => {
    console.log(
      `[${processName}] Received SIGINT, shutting down gracefully...`
    );
    forwardSignal('SIGINT');

    // Give children time to clean up, then force exit
    setTimeout(() => {
      console.log(`[${processName}] Force exiting after SIGINT`);
      process.exit(0);
    }, 5000);
  });
}

/**
 * Main function that orchestrates the child spawning process
 */
async function main(): Promise<{
  app: Express.Application;
  server: http.Server;
}> {
  const config = parseProcessArgs();
  const processName = generateProcessName(
    config.baseName,
    config.depth,
    config.position
  );

  console.log(`[${processName}] Starting process with PID ${process.pid}`);
  console.log(`[${processName}] Config:`, {
    childrenCount: config.childrenCount,
    depth: config.depth,
    baseName: config.baseName,
    outputDir: config.outputDir,
    position: config.position,
    parentPid: config.parentPid,
  });

  // Ensure output directory exists
  await fse.ensureDir(config.outputDir);

  // Write current process PID
  await writeCurrentProcessPid(config);

  // Start dummy server to keep process alive
  const serverPort = await getPort();
  console.log(`[${processName}] Starting dummy server on port ${serverPort}`);

  let app: Express.Application;
  let server: http.Server;

  try {
    const {app: expressApp, server: httpServer} = await newDummyServer({
      port: serverPort,
    });
    app = expressApp;
    server = httpServer;
  } catch (error) {
    console.error(`[${processName}] Failed to start dummy server:`, error);
    process.exit(1);
  }

  // Spawn children if depth > 0
  const children = await spawnChildren(config);

  // Set up signal forwarding to children
  if (children.length > 0) {
    setupSignalForwarding(children, processName);
  }

  if (children.length > 0) {
    console.log(
      `[${processName}] Spawned ${children.length} children, waiting for them to be ready...`
    );
    await waitForChildrenReady(children, processName);
  } else {
    console.log(`[${processName}] No children to spawn (depth reached 0)`);
  }

  // Send ready message to parent (including root process for test usage)
  console.log(`[${processName}] Sending ready message to parent`);
  const pgid = getCurrentProcessGroupId();
  sendMessageToParent({
    type: 'ready',
    processName,
    pid: process.pid,
    pgid,
    childrenCount: children.length,
  });

  console.log(
    `[${processName}] Process ${process.pid} ready and keeping alive`
  );

  return {app, server};
}

// Start the main function
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(({app, server}) => {
      // Keep the process alive by not exiting
      // The HTTP server should keep the event loop alive
      console.log('Process ready, keeping alive...');
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export {
  generateProcessName,
  getCurrentProcessGroupId,
  main,
  parseProcessArgs,
  spawnChildren,
  waitForChildrenReady,
  writeCurrentProcessPid,
};
