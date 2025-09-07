import fs from 'fs';
import {range} from 'lodash-es';
import {waitTimeout} from 'softkave-js-utils';
import {getMongodSystemLogFilePath, MongoRunConfig} from '../index.js';

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
    const systemLogs = await fs.promises.readFile(systemLogsFilepath, 'utf8');
    // Check for mongod startup completion and readiness to accept connections
    if (
      systemLogs.includes('mongod startup complete') &&
      systemLogs.includes('Waiting for connections')
    ) {
      return true;
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
    // Check all instances to see if replica set is ready
    const allLogs = await Promise.all(
      instanceNumbers.map(async instanceNumber => {
        const systemLogsFilepath = getMongodSystemLogFilePath(
          mongoRunConfig,
          instanceNumber + 1
        );
        return await fs.promises.readFile(systemLogsFilepath, 'utf8');
      })
    );

    // Check if any instance has completed replica set initialization
    const hasInitiation = allLogs.some(logs =>
      logs.includes('replSetInitiate config object parses ok')
    );

    // Check if any instance has become PRIMARY
    const hasPrimaryElection = allLogs.some(logs =>
      logs.includes('Election succeeded, assuming primary role')
    );

    // Check if all instances have learned about the new PRIMARY
    const allLearnedAboutPrimary = allLogs.every(
      logs =>
        logs.includes(
          'Restarting heartbeats after learning of a new primary'
        ) || logs.includes('Election succeeded, assuming primary role')
    );

    if (hasInitiation && hasPrimaryElection && allLearnedAboutPrimary) {
      return true;
    }

    await waitTimeout(intervalMS);
  }

  return false;
}
