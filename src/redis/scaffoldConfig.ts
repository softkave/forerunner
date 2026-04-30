import {promises as fs} from 'fs';
import path from 'path';
import {createInterface} from 'readline';
import {generateMongoPassword} from '../mongo/utils.js';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {readPassword} from '../utils/readPassword.js';
import {RedisRunConfig, redisRunConfigSchema} from './redisRunConfig.js';

function question(
  rl: ReturnType<typeof createInterface>,
  query: string
): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

function getDefaultConfig(
  mode: RedisRunConfig['mode'] = 'single'
): RedisRunConfig {
  const base: any = {
    workingDir: process.cwd(),
    redisVersion: '8.6.2',
    discoverability: 'local',
    auth: 'enabled',
    tls: 'disabled',
    keep: false,
    persistence: {aof: 'enabled', rdbSnapshots: 'enabled'},
  };

  if (mode === 'single') {
    return redisRunConfigSchema.parse({
      ...base,
      mode: 'single',
      containerName: 'redis',
      port: 6379,
    });
  }

  if (mode === 'cluster') {
    return redisRunConfigSchema.parse({
      ...base,
      mode: 'cluster',
      containerNamePrefix: 'redis-cluster',
      masters: 3,
      replicasPerMaster: 1,
      basePort: 7000,
    });
  }

  return redisRunConfigSchema.parse({
    ...base,
    mode: 'sentinel',
    containerNamePrefix: 'redis-sentinel',
    masterPort: 6379,
    replicas: 2,
    replicaBasePort: 6381,
    sentinels: 3,
    sentinelBasePort: 26379,
    quorum: 2,
  });
}

export async function scaffoldRedisConfig(params: {
  outputPath: string;
  logger?: IForeLogger;
  useDefaults?: boolean;
}): Promise<RedisRunConfig> {
  const {
    outputPath,
    logger = new ConsoleForeLogger({silent: false}),
    useDefaults = false,
  } = params;

  let config: any;

  if (useDefaults) {
    config = getDefaultConfig('single');
    logger.log('Using default Redis configuration values (mode=single)');
  } else {
    const rl = createInterface({input: process.stdin, output: process.stdout});
    try {
      logger.log('Redis Configuration Scaffold');
      logger.log('Press Enter to use defaults (shown in brackets)');

      const modeRaw = await question(
        rl,
        'Mode: single | cluster | sentinel [single]: '
      );
      const mode =
        modeRaw.trim().toLowerCase() === 'cluster'
          ? 'cluster'
          : modeRaw.trim().toLowerCase() === 'sentinel'
            ? 'sentinel'
            : 'single';

      config = getDefaultConfig(mode);

      const workingDir = await question(
        rl,
        `Working directory [${config.workingDir}]: `
      );
      if (workingDir.trim()) config.workingDir = workingDir.trim();

      const discoverability = await question(
        rl,
        'Discoverability: local (127.0.0.1) or global (all interfaces)? [local]: '
      );
      config.discoverability =
        discoverability.trim().toLowerCase() === 'global' ? 'global' : 'local';

      const authStr = await question(rl, 'Authorization enabled? (y/n) [y]: ');
      config.auth =
        authStr.trim().toLowerCase() === 'n' ? 'disabled' : 'enabled';

      if (config.auth === 'enabled') {
        const pw = await readPassword(
          'Redis password (press Enter to auto-generate): '
        );
        config.password = pw.trim() ? pw.trim() : generateMongoPassword();
        if (!pw.trim()) {
          logger.log(`✅ Auto-generated password: ${config.password}`);
        }
      } else {
        delete config.password;
      }

      const tlsStr = await question(rl, 'TLS enabled? (y/n) [n]: ');
      const tlsEnabled = tlsStr.trim().toLowerCase() === 'y';
      config.tls = tlsEnabled ? 'enabled' : 'disabled';
      if (tlsEnabled) {
        config.tlsConfig = config.tlsConfig ?? {};
        const tlsPortStr = await question(rl, 'TLS port [6380]: ');
        if (tlsPortStr.trim())
          config.tlsConfig.tlsPort = parseInt(tlsPortStr, 10);
        // CA config is required when TLS is enabled; keep scaffold minimal and
        // let user edit these fields as needed.
        config.tlsConfig.caConfig = {
          days: 3650,
          subject: {
            C: 'NG',
            ST: 'LA',
            L: 'Ikeja',
            O: 'MyOrg',
            CN: 'MyOrg Redis CA',
          },
          passphrase: generateMongoPassword(),
        };
        logger.log(
          'Generated a default tlsConfig.caConfig (edit it in the JSON if needed)'
        );
      }

      const keepStr = await question(
        rl,
        'Keep data across restarts? (y/n) [n]: '
      );
      config.keep = keepStr.trim().toLowerCase() === 'y';

      if (mode === 'single') {
        const containerName = await question(rl, 'Container name [redis]: ');
        config.containerName = containerName.trim() || 'redis';
        const portStr = await question(rl, 'Port [6379]: ');
        config.port = portStr.trim() ? parseInt(portStr, 10) : 6379;
      } else if (mode === 'cluster') {
        const prefix = await question(
          rl,
          'Container name prefix [redis-cluster]: '
        );
        config.containerNamePrefix = prefix.trim() || 'redis-cluster';
        const mastersStr = await question(rl, 'Masters [3]: ');
        if (mastersStr.trim()) config.masters = parseInt(mastersStr, 10);
        const replStr = await question(rl, 'Replicas per master [1]: ');
        if (replStr.trim()) config.replicasPerMaster = parseInt(replStr, 10);
        const basePortStr = await question(rl, 'Base port [7000]: ');
        if (basePortStr.trim()) config.basePort = parseInt(basePortStr, 10);
      } else {
        const prefix = await question(
          rl,
          'Container name prefix [redis-sentinel]: '
        );
        config.containerNamePrefix = prefix.trim() || 'redis-sentinel';
        const masterPortStr = await question(rl, 'Master port [6379]: ');
        if (masterPortStr.trim())
          config.masterPort = parseInt(masterPortStr, 10);
        const replicasStr = await question(rl, 'Replica count [2]: ');
        if (replicasStr.trim()) config.replicas = parseInt(replicasStr, 10);
        const sentinelsStr = await question(rl, 'Sentinel count [3]: ');
        if (sentinelsStr.trim()) config.sentinels = parseInt(sentinelsStr, 10);
        const quorumStr = await question(rl, 'Quorum [2]: ');
        if (quorumStr.trim()) config.quorum = parseInt(quorumStr, 10);
      }
    } finally {
      rl.close();
    }
  }

  const validated = redisRunConfigSchema.parse(config);

  const outDir = path.dirname(outputPath);
  await fs.mkdir(outDir, {recursive: true});
  await fs.writeFile(outputPath, JSON.stringify(validated, null, 2), 'utf8');
  logger.log(`Configuration written to ${outputPath}`);

  return validated;
}
