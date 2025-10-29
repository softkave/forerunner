import {ChildProcess, spawn} from 'child_process';
import {ensureDir, remove} from 'fs-extra';
import path from 'path';
import {afterAll, afterEach, beforeAll, describe, expect, test} from 'vitest';
import {
  readAllPIDsFromDirectory,
  waitForChildrenReady,
} from '../../testHelpers/childSpawner.js';
import {findChildrenPIDs} from '../findChildrenPIDs.js';

const testDir = '.' + path.sep + 'testdir/findChildrenPIDs';
const childSpawnerPath = path.join(__dirname, '../testHelpers/childSpawner.ts');

const spawnedChildren: ChildProcess[] = [];

/**
 * Helper function to clean up a child process
 */
async function cleanupProcess(process: any): Promise<void> {
  try {
    if (process.pid && !process.killed) {
      console.log('Killing process', process.pid);
      process.kill('SIGTERM');
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 5000));
      // Force kill if still running
      if (!process.killed) {
        process.kill('SIGKILL');
      }
    }
  } catch (error) {
    console.error('Error killing process', process.pid, error);
  }
}

beforeAll(async () => {
  await ensureDir(testDir);
});

afterEach(async () => {
  await Promise.all(
    spawnedChildren.map(async child => {
      await cleanupProcess(child);
    })
  );
});

afterAll(async () => {
  await remove(testDir);
});

describe('findChildrenPIDs', () => {
  test('finds all child PIDs in a process hierarchy', async () => {
    // Skip test on Windows since findChildrenPIDs only works on Linux/macOS
    if (process.platform === 'win32') {
      console.log(
        'Skipping test on Windows - findChildrenPIDs only works on Linux/macOS'
      );
      return;
    }

    const outputDir = path.join(testDir, 'hierarchy-test');

    // Spawn a process hierarchy using childSpawner
    // This will create: parent -> 2 children -> 2 grandchildren each (4 total grandchildren)
    const childSpawnerProcess = spawn(
      'node',
      [
        '--import=tsx',
        childSpawnerPath,
        '--children',
        '2',
        '--depth',
        '2',
        '--name',
        'test-process',
        '--output',
        outputDir,
        '--position',
        '0',
        '--parent-pid',
        process.pid.toString(),
      ],
      {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'], // Enable IPC for waitForChildrenReady
        detached: false,
        serialization: 'json',
      }
    );

    try {
      // Wait for the child spawner to be ready using waitForChildrenReady
      await waitForChildrenReady([childSpawnerProcess], 'test-hierarchy');

      // Read all PIDs from the directory using readAllPIDsFromDirectory
      const allPids = await readAllPIDsFromDirectory(outputDir);

      console.log('All PIDs from directory:', allPids);

      // Find the parent process (depth 2, position 0)
      const parentProcess = allPids.find(p => p.name === 'test-process-d2-p0');
      expect(parentProcess).toBeDefined();

      const parentPid = parseInt(parentProcess!.pid, 10);

      // Use findChildrenPIDs to get all child PIDs
      const foundChildrenPIDs = await findChildrenPIDs(parentPid);

      expect(foundChildrenPIDs.length).toBeGreaterThan(0);

      // Get all PIDs from the directory except the parent
      const expectedChildPIDs = allPids
        .filter(p => p.name !== 'test-process-d2-p0')
        .map(p => parseInt(p.pid, 10));

      // Verify that findChildrenPIDs found all the expected child PIDs
      expect(foundChildrenPIDs).toEqual(
        expect.arrayContaining(expectedChildPIDs)
      );
      expect(foundChildrenPIDs.length).toBeGreaterThanOrEqual(
        expectedChildPIDs.length
      );

      // Verify that the parent PID is not included in the results
      expect(foundChildrenPIDs).not.toContain(parentPid);

      console.log('Parent PID:', parentPid);
      console.log('Expected child PIDs:', expectedChildPIDs);
      console.log('Found child PIDs:', foundChildrenPIDs);
    } finally {
      // Clean up the child spawner process
      await cleanupProcess(childSpawnerProcess);
    }
  }, 20000); // 20 second timeout for process spawning

  test('handles process with no children', async () => {
    // Skip test on Windows since findChildrenPIDs only works on Linux/macOS
    if (process.platform === 'win32') {
      console.log(
        'Skipping test on Windows - findChildrenPIDs only works on Linux/macOS'
      );
      return;
    }

    const outputDir = path.join(testDir, 'no-children-test');

    // Spawn a process with depth 0 (no children)
    const childSpawnerProcess = spawn(
      'node',
      [
        '--import=tsx',
        childSpawnerPath,
        '--children',
        '0',
        '--depth',
        '0',
        '--name',
        'no-children-process',
        '--output',
        outputDir,
        '--position',
        '0',
        '--parent-pid',
        process.pid.toString(),
      ],
      {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'], // Enable IPC for waitForChildrenReady
        detached: false,
        serialization: 'json',
      }
    );

    try {
      // Wait for the child spawner to be ready using waitForChildrenReady
      await waitForChildrenReady([childSpawnerProcess], 'no-children-test');

      // Read all PIDs from the directory using readAllPIDsFromDirectory
      const allPids = await readAllPIDsFromDirectory(outputDir);

      // Find the parent process
      const parentProcess = allPids.find(
        p => p.name === 'no-children-process-d0-p0'
      );
      expect(parentProcess).toBeDefined();

      const parentPid = parseInt(parentProcess!.pid, 10);

      // Use findChildrenPIDs to get all child PIDs
      const foundChildrenPIDs = await findChildrenPIDs(parentPid);

      // Should find no children
      expect(foundChildrenPIDs).toEqual([]);
    } finally {
      // Clean up the child spawner process
      await cleanupProcess(childSpawnerProcess);
    }
  }, 15000); // 15 second timeout

  test('throws error on unsupported platform', async () => {
    // Mock process.platform to test the error case
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true,
    });

    try {
      await expect(findChildrenPIDs(12345)).rejects.toThrow(
        'findChildrenPIDs only works on Linux and macOS systems'
      );
    } finally {
      // Restore original platform
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        writable: true,
      });
    }
  });

  test('handles non-existent process gracefully', async () => {
    // Skip test on Windows since findChildrenPIDs only works on Linux/macOS
    if (process.platform === 'win32') {
      console.log(
        'Skipping test on Windows - findChildrenPIDs only works on Linux/macOS'
      );
      return;
    }

    // Use a very high PID that's unlikely to exist
    const nonExistentPid = 999999;
    const foundChildrenPIDs = await findChildrenPIDs(nonExistentPid);

    // Should return empty array for non-existent process
    expect(foundChildrenPIDs).toEqual([]);
  });
});
