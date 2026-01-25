import {ensureDir, ensureFile} from 'fs-extra';
import fs from 'fs/promises';
import {load} from 'js-yaml';
import path from 'path';
import {startProcess} from '../process/startProcess.js';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {
  assertMongoInstanceListening,
  assertMongoInstancesListening,
  assertMongoReplicaSetReady,
  waitForMemberState,
} from './checkMongoReadyState.js';
import {getInstancePaths} from './constants.js';
import {getMongodBinFilePath} from './downloadMongo.js';
import {
  getMongodConfigFilePath,
  MongoConfigSchema,
} from './generateMongodConfigs.js';
import {MongoRunConfig} from './mongoRunConfig.js';

export async function generateRunShFile(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  startShFilepath: string;
}) {
  const {instanceNumber, mongoRunConfig, startShFilepath} = params;

  const mongodBinFilePath = getMongodBinFilePath(mongoRunConfig);
  const mongodConfigFilePath = getMongodConfigFilePath(
    mongoRunConfig,
    instanceNumber
  );

  const cmd = `${mongodBinFilePath} --config ${mongodConfigFilePath}`;
  await ensureFile(startShFilepath);
  await fs.writeFile(startShFilepath, cmd, 'utf8');

  return startShFilepath;
}

export async function ensureMongodInstanceFiles(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
}) {
  const {instanceNumber, mongoRunConfig} = params;

  const mongodConfigFilePath = getMongodConfigFilePath(
    mongoRunConfig,
    instanceNumber
  );
  const mongodConfig = MongoConfigSchema.parse(
    load(await fs.readFile(mongodConfigFilePath, 'utf8'))
  );

  const systemLogDir = path.dirname(mongodConfig.systemLog.path);
  await Promise.all([
    ensureDir(mongodConfig.storage.dbPath),
    // Mongo config is set to daily rotate log files, so we need to ensure only
    // the log directory exists, not the log files themselves.
    ensureDir(systemLogDir),
  ]);
}

export async function startMongodInstance(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  waitUntilListening?: boolean;
  waitUntilReplicaSetReady?: boolean;
}) {
  const {
    instanceNumber,
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    waitUntilListening = false,
    waitUntilReplicaSetReady = false,
  } = params;

  const {
    instanceRunDir,
    instancePidFilepath,
    instanceLogsDir,
    instanceRunName,
    startShFilepath,
  } = getInstancePaths({instanceNumber, mongoRunConfig});
  await ensureDir(instanceRunDir);

  await generateRunShFile({
    instanceNumber,
    mongoRunConfig,
    startShFilepath,
  });

  logger.log('Instance run name:', instanceRunName);
  logger.log('Instance run dir:', instanceRunDir);
  logger.log('Instance pid filepath:', instancePidFilepath);
  logger.log('Instance logs dir:', instanceLogsDir);
  logger.log('Instance start sh filepath:', startShFilepath);

  logger.log('Ensuring mongod instance files...');
  await ensureMongodInstanceFiles({instanceNumber, mongoRunConfig});

  logger.log('Starting mongod instance...\n');
  await startProcess({
    name: instanceRunName,
    startCmdFilepath: startShFilepath,
    pidsFilepath: instancePidFilepath,
    // cwd: instanceRunDir,
    logsFolderpath: instanceLogsDir,
    runName: instanceRunName,
  });

  if (waitUntilListening) {
    logger.log(`Waiting for ${instanceRunName} to begin listening...`);
    await assertMongoInstanceListening({
      mongoRunConfig,
      instanceNumber,
      logger,
    });
  }

  if (waitUntilReplicaSetReady) {
    logger.log(
      `Waiting for ${instanceRunName} to reach PRIMARY or SECONDARY state...`
    );
    await waitForMemberState({
      instanceNumber,
      mongoRunConfig,
      logger,
    });
  }
}

export async function startMongodInstancesMain(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  waitUntilListening?: boolean;
  waitUntilReplicaSetReady?: boolean;
}) {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    waitUntilListening,
    waitUntilReplicaSetReady,
  } = params;

  for (let i = 1; i <= mongoRunConfig.instancePorts.length; i++) {
    await startMongodInstance({instanceNumber: i, mongoRunConfig, logger});
  }

  if (waitUntilListening) {
    logger.log('Waiting for Mongo instances to begin listening...');
    await assertMongoInstancesListening({mongoRunConfig, logger});
  }

  if (waitUntilReplicaSetReady) {
    logger.log('Waiting for replica set to be ready...');
    await assertMongoReplicaSetReady({mongoRunConfig, logger});
  }
}
