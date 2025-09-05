import {Command} from 'commander';
import {listHosts, setHost} from '../../../forerunner/src/etcHosts/helpers.js';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {getMongoRunConfig, MongoRunConfig} from './mongoRunConfig.js';
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
  for (const hostname of nonLocalhostBindIp) {
    if (currentEtcHostsMap.has(hostname)) {
      continue;
    }
    setHost({hostname, ip: localIp, logger});
  }
}

export async function setNonLocalhostNamesInEtcHostsMain(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}) {
  const {mongoRunConfig, logger = new ConsoleForeLogger({silent: true})} =
    params;
  const replicaCount = mongoRunConfig.replicaCount;
  for (let i = 1; i <= replicaCount; i++) {
    await setNonLocalhostNamesInEtcHosts({
      instanceNumber: i,
      mongoRunConfig,
      logger,
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const program = new Command();
  program
    .requiredOption('-c, --config <path>', 'Path to mongoRunConfig file')
    .option('-s, --silent', 'silent mode')
    .parse(process.argv);
  const options = program.opts();
  const mongoRunConfig = await getMongoRunConfig({
    mongoRunConfigFilepath: options.config,
    checkExisting: false,
  });
  await setNonLocalhostNamesInEtcHostsMain({
    mongoRunConfig,
    logger: new ConsoleForeLogger({silent: options.silent}),
  });
}
