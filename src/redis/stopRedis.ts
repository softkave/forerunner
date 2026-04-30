import {execFile} from 'child_process';
import path from 'path';
import {promisify} from 'util';
import {
  containerExists,
  isContainerRunning,
  removeVolume,
  volumeExists,
} from '../utils/docker.js';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {spawnInherit} from '../utils/spawnInherit.js';
import {removeNetwork} from '../utils/docker.js';
import {getRedisNetworkName} from './dockerNetName.js';
import {RedisRunConfig} from './redisRunConfig.js';
import {getRedisTopology} from './topology.js';

const execFileAsync = promisify(execFile);

async function stopAndRemoveContainer(params: {
  name: string;
  logger: IForeLogger;
  force?: boolean;
}) {
  const {name, logger, force} = params;
  if (!(await containerExists(name))) return;
  if (await isContainerRunning(name)) {
    const stopArgs = force ? ['kill', name] : ['stop', name];
    await spawnInherit('docker', stopArgs);
  }
  try {
    await execFileAsync('docker', ['rm', '-v', name], {encoding: 'utf8'});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.log(`Could not remove container ${name}: ${msg}`);
  }
}

async function removeVolumeIfRequested(params: {
  volumeName: string;
  logger: IForeLogger;
}) {
  const {volumeName, logger} = params;
  if (!(await volumeExists(volumeName))) return;
  try {
    await removeVolume(volumeName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.log(`Could not remove volume ${volumeName}: ${msg}`);
  }
}

export async function stopRedisMain(params: {
  redisRunConfig: RedisRunConfig;
  logger?: IForeLogger;
  force?: boolean;
  removeVolumes?: boolean;
}) {
  const {
    redisRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    force = false,
    removeVolumes = false,
  } = params;

  const topology = getRedisTopology(redisRunConfig);

  for (const node of topology.nodes) {
    logger.log(`Stopping ${node.name}...`);
    await stopAndRemoveContainer({name: node.name, logger, force});
    if (removeVolumes || !redisRunConfig.keep) {
      await removeVolumeIfRequested({volumeName: node.volumeName, logger});
    }
  }

  if (topology.mode === 'sentinel') {
    for (const s of topology.sentinels) {
      logger.log(`Stopping ${s.name}...`);
      await stopAndRemoveContainer({name: s.name, logger, force});
      if (removeVolumes || !redisRunConfig.keep) {
        await removeVolumeIfRequested({volumeName: s.volumeName, logger});
      }
    }
  }

  // Best-effort network removal
  const networkName = getRedisNetworkName({
    workingDir: path.resolve(redisRunConfig.workingDir),
  });
  await removeNetwork(networkName);
}
