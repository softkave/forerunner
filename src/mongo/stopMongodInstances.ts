import {ensureDir, ensureFile} from 'fs-extra';
import path from 'path';
import {endPIDs} from '../pid/endPIDs.js';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {getMongodConfigForInstance} from './utils.js';

export async function stopMongodInstance(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}) {
  const {
    instanceNumber,
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
  } = params;
  const instanceRunName = `mongod-${instanceNumber}`;
  const instanceRunDir = path.join(
    mongoRunConfig.workingDir,
    'mongo-run',
    instanceRunName
  );
  const instancePidFilename = `${instanceRunName}.pid`;
  const instancePidFilepath = path.join(instanceRunDir, instancePidFilename);
  await ensureDir(instanceRunDir);
  await ensureFile(instancePidFilepath);

  const config = await getMongodConfigForInstance({
    instanceNumber,
    mongoRunConfig,
  });
  logger.log('Stopping mongod instance', instanceRunName);
  logger.log('Instance port', config.net.port);
  await endPIDs({
    pidsFilepath: instancePidFilepath,
    cwd: instanceRunDir,
    ports: [config.net.port],
  });
}

export async function stopMongodInstancesMain(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}) {
  const {mongoRunConfig, logger = new ConsoleForeLogger({silent: true})} =
    params;
  const replicaCount = mongoRunConfig.replicaCount;
  await Promise.all(
    Array.from({length: replicaCount}, async (_, i) => {
      await stopMongodInstance({instanceNumber: i + 1, mongoRunConfig, logger});
    })
  );
}
