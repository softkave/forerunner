import path from 'path';
import {MongoRunConfig} from './mongoRunConfig.js';

export function getInstanceRunName(instanceNumber: number) {
  return `mongod-${instanceNumber}`;
}

export function getInstancePaths(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
}) {
  const {instanceNumber, mongoRunConfig} = params;

  const instanceRunName = getInstanceRunName(instanceNumber);
  const instanceRunDir = path.join(
    mongoRunConfig.workingDir,
    'mongo-run',
    instanceRunName
  );
  const instancePidFilepath = path.join(
    instanceRunDir,
    `${instanceRunName}.pid`
  );
  const instanceLogsDir = path.join(instanceRunDir, `${instanceRunName}-logs`);
  const startShFilepath = path.join(
    mongoRunConfig.workingDir,
    'start-mongod-scripts',
    `start-mongod-${instanceNumber}.sh`
  );

  return {
    instanceRunDir,
    instancePidFilepath,
    instanceLogsDir,
    instanceRunName,
    startShFilepath,
  };
}
