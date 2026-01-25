import {listHosts, setHost} from '../etcHosts/helpers.js';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {getLocalIP} from '../utils/getLocalIP.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {getMongodConfigForInstance, getNonLocalhostBindIps} from './utils.js';

export async function setNonLocalhostNamesInEtcHosts(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}) {
  const {
    instanceNumber,
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
  } = params;
  const mongodConfig = await getMongodConfigForInstance({
    instanceNumber,
    mongoRunConfig,
  });
  const bindIp = mongodConfig.net.bindIp;
  const nonLocalhostBindIp = getNonLocalhostBindIps({bindIp});
  if (!nonLocalhostBindIp) {
    return;
  }

  const currentEtcHosts = listHosts({logger});
  const currentEtcHostsMap = new Map(
    currentEtcHosts.map(host => [host.hostname, host])
  );

  const localIp = '127.0.0.1';
  const {ipv4} = getLocalIP();
  const ip = ipv4[0] ?? localIp;
  for (const hostname of nonLocalhostBindIp) {
    if (currentEtcHostsMap.has(hostname)) {
      continue;
    }
    setHost({hostname, ip, logger});
  }
}

export async function setNonLocalhostNamesInEtcHostsMain(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}) {
  const {mongoRunConfig, logger = new ConsoleForeLogger({silent: true})} =
    params;

  for (let i = 1; i <= mongoRunConfig.instancePorts.length; i++) {
    await setNonLocalhostNamesInEtcHosts({
      instanceNumber: i,
      mongoRunConfig,
      logger,
    });
  }
}
