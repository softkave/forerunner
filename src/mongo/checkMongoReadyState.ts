import fs from 'fs';
import {range} from 'lodash-es';
import {waitTimeout} from 'softkave-js-utils';
import {getMongodSystemLogFilePath, MongoRunConfig} from '../index.js';

const CHUNK_SIZE = 64 * 1024; // 64KB chunks
const OVERLAP_SIZE = 1024; // 1KB overlap to handle split strings

/**
 * Reads a file in chunks from the end backwards and finds the last occurrence
 * of "SERVER RESTARTED" message. Returns the position where content after the
 * last restart should start reading from
 */
async function findLastRestartPosition(filePath: string): Promise<number> {
  const restartMarker = '***** SERVER RESTARTED *****';
  const fd = await fs.promises.open(filePath, 'r');

  try {
    // Get file size to start reading from the end
    const stats = await fd.stat();
    const fileSize = stats.size;

    if (fileSize === 0) {
      return -1; // Empty file
    }

    let position = Math.max(0, fileSize - CHUNK_SIZE);
    let overlapBuffer = '';

    while (position >= 0) {
      const buffer = Buffer.alloc(CHUNK_SIZE);
      const {bytesRead} = await fd.read(
        buffer as Uint8Array,
        0,
        CHUNK_SIZE,
        position
      );

      if (bytesRead === 0) {
        break; // Should not happen, but safety check
      }

      const chunk = buffer.toString('utf8', 0, bytesRead);
      const searchContent = chunk + overlapBuffer;

      // Check if restart marker is found in this chunk
      const restartIndex = searchContent.lastIndexOf(restartMarker);
      if (restartIndex !== -1) {
        // Found the restart marker, return the position after it
        return position + restartIndex + restartMarker.length;
      }

      // Prepare overlap for next chunk (previous chunk in file). Keep the first
      // part of the chunk as overlap to handle split strings. This is safe
      // because the OVERLAP_SIZE is much bigger than restart marker.
      if (searchContent.length > OVERLAP_SIZE) {
        overlapBuffer = searchContent.slice(0, OVERLAP_SIZE);
      } else {
        overlapBuffer = searchContent;
      }

      // Move to previous chunk
      if (position === 0) {
        break; // We've reached the beginning of the file
      }

      // Calculate next position, ensuring we don't go negative
      const nextPosition = Math.max(0, position - CHUNK_SIZE);

      // If we're reading from the beginning, adjust the read size
      if (nextPosition === 0) {
        position = 0;
      } else {
        position = nextPosition;
      }
    }

    return -1; // No restart marker found
  } finally {
    await fd.close();
  }
}

/**
 * Reads file content from a specific position in chunks and searches for
 * patterns. Returns true if any of the search patterns are found
 */
async function searchInFileChunks(
  filePath: string,
  startPosition: number,
  searchPatterns: string[]
): Promise<boolean> {
  const fd = await fs.promises.open(filePath, 'r');

  try {
    let position = startPosition;
    let overlapBuffer = '';

    while (true) {
      const buffer = Buffer.alloc(CHUNK_SIZE);
      const {bytesRead} = await fd.read(
        buffer as Uint8Array,
        0,
        CHUNK_SIZE,
        position
      );

      if (bytesRead === 0) {
        break; // End of file
      }

      const chunk = buffer.toString('utf8', 0, bytesRead);
      const searchContent = overlapBuffer + chunk;

      // Check if any pattern is found in the current content
      for (const pattern of searchPatterns) {
        if (searchContent.includes(pattern)) {
          return true;
        }
      }

      // Move to next chunk, ensuring we end at a newline
      let nextPosition = position + bytesRead;
      let effectiveChunkEnd = bytesRead;

      if (bytesRead < CHUNK_SIZE) {
        break; // End of file
      }

      // Find the last newline in the chunk
      const lastNewlineIndex = chunk.lastIndexOf('\n');
      if (lastNewlineIndex !== -1) {
        nextPosition = position + lastNewlineIndex + 1;
        effectiveChunkEnd = lastNewlineIndex + 1;
      }

      // Prepare overlap for next chunk
      // Use only the effective chunk content (up to the newline boundary)
      const effectiveChunk = chunk.slice(0, effectiveChunkEnd);
      if (effectiveChunk.length > OVERLAP_SIZE) {
        overlapBuffer = effectiveChunk.slice(-OVERLAP_SIZE);
      } else {
        overlapBuffer = effectiveChunk;
      }

      position = nextPosition;
    }

    return false;
  } finally {
    await fd.close();
  }
}

export async function checkMongoInstanceListening(params: {
  mongoRunConfig: MongoRunConfig;
  instanceNumber: number;
  timeoutMS?: number;
  intervalMS?: number;
}) {
  const {
    mongoRunConfig,
    instanceNumber,
    timeoutMS = 15_000,
    intervalMS = 1_000,
  } = params;
  const systemLogsFilepath = getMongodSystemLogFilePath(
    mongoRunConfig,
    instanceNumber
  );
  const start = Date.now();

  while (Date.now() - start < timeoutMS) {
    try {
      // Find the last restart position
      const restartPosition = await findLastRestartPosition(systemLogsFilepath);
      const startPosition = restartPosition === -1 ? 0 : restartPosition;

      // Search for readiness patterns in chunks
      const searchPatterns = [
        'mongod startup complete',
        'Waiting for connections',
      ];
      const foundPatterns = await Promise.all(
        searchPatterns.map(pattern =>
          searchInFileChunks(systemLogsFilepath, startPosition, [pattern])
        )
      );

      // Check if both patterns are found
      if (foundPatterns.every(found => found)) {
        return true;
      }
    } catch (error) {
      // If file doesn't exist or can't be read, continue waiting
      console.warn(`Error reading log file ${systemLogsFilepath}:`, error);
    }

    await waitTimeout(intervalMS);
  }

  return false;
}

export async function checkMongoInstancesListening(params: {
  mongoRunConfig: MongoRunConfig;
  timeoutMS?: number;
  intervalMS?: number;
}) {
  const {mongoRunConfig, timeoutMS = 15_000, intervalMS = 1_000} = params;
  const instanceNumbers = range(mongoRunConfig.instancePorts.length);
  const results = await Promise.all(
    instanceNumbers.map(instanceNumber =>
      checkMongoInstanceListening({
        mongoRunConfig,
        instanceNumber: instanceNumber + 1,
        timeoutMS,
        intervalMS,
      })
    )
  );
  return results.every(result => result);
}

export async function checkMongoReplicaSetReady(params: {
  mongoRunConfig: MongoRunConfig;
  timeoutMS?: number;
  intervalMS?: number;
}) {
  const {mongoRunConfig, timeoutMS = 15_000, intervalMS = 1_000} = params;
  const instanceNumbers = range(mongoRunConfig.instancePorts.length);
  const start = Date.now();

  while (Date.now() - start < timeoutMS) {
    try {
      // Check all instances to see if replica set is ready
      const instanceResults = await Promise.all(
        instanceNumbers.map(async instanceNumber => {
          const systemLogsFilepath = getMongodSystemLogFilePath(
            mongoRunConfig,
            instanceNumber + 1
          );

          try {
            // Find the last restart position for this instance
            const restartPosition =
              await findLastRestartPosition(systemLogsFilepath);
            const startPosition = restartPosition === -1 ? 0 : restartPosition;

            // Define search patterns for replica set readiness
            const initiationPatterns = [
              'replSetInitiate config object parses ok',
              'Taking a stable checkpoint for replSetInitiate',
              'New replica set config in use',
            ];

            const primaryElectionPatterns = [
              'Election succeeded, assuming primary role',
              'Replica set state transition',
            ];

            const primaryLearningPatterns = [
              'Restarting heartbeats after learning of a new primary',
              'Election succeeded, assuming primary role',
              'Replica set state transition',
            ];

            // Search for patterns in chunks
            const [hasInitiation, hasPrimaryElection, hasPrimaryLearning] =
              await Promise.all([
                searchInFileChunks(
                  systemLogsFilepath,
                  startPosition,
                  initiationPatterns
                ),
                searchInFileChunks(
                  systemLogsFilepath,
                  startPosition,
                  primaryElectionPatterns
                ),
                searchInFileChunks(
                  systemLogsFilepath,
                  startPosition,
                  primaryLearningPatterns
                ),
              ]);

            // TODO: For primary election and learning, we need to check for
            // specific combinations. This is a simplified check - in practice,
            // we might want to do more sophisticated pattern matching to ensure
            // the right combinations are found
            return {
              hasInitiation,
              hasPrimaryElection,
              hasPrimaryLearning,
            };
          } catch (error) {
            console.warn(
              `Error reading log file ${systemLogsFilepath}:`,
              error
            );
            return {
              hasInitiation: false,
              hasPrimaryElection: false,
              hasPrimaryLearning: false,
            };
          }
        })
      );

      // Check if any instance has completed replica set initialization
      const hasInitiation = instanceResults.some(
        result => result.hasInitiation
      );

      // Check if any instance has become PRIMARY
      const hasPrimaryElection = instanceResults.some(
        result => result.hasPrimaryElection
      );

      // Check if all instances have learned about the new PRIMARY
      const allLearnedAboutPrimary = instanceResults.every(
        result => result.hasPrimaryLearning || result.hasPrimaryElection
      );

      if (hasInitiation && hasPrimaryElection && allLearnedAboutPrimary) {
        return true;
      }
    } catch (error) {
      console.warn('Error checking replica set readiness:', error);
    }

    await waitTimeout(intervalMS);
  }

  return false;
}
