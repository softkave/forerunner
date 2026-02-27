#!/usr/bin/env node
/* eslint-disable n/no-process-exit */

import {Command} from 'commander';
import {ConsoleForeLogger} from './utils/foreLogger/ConsoleForeLogger.js';
import {getVersion} from './version.js';

// Import certs functionality
import {generateCA} from './certs/caGenerator.js';
import {generateCert} from './certs/certGenerator.js';
import {GenerateCertsCLIOptionsSchema} from './certs/types.js';

// Import mongo functionality
import {
  generateMongoCertConfigsMain,
  generateMongoCertsMain,
  getReplicaSetStatus,
  printMongoUriMain,
  restartMongo,
  scaffoldMongoConfig,
  setupReplicaSetMain,
  startMongoMain,
  stopMongoMain,
  validateMongoConfig,
} from './mongo/index.js';
import {getMongoRunConfig} from './mongo/mongoRunConfig.js';

// Import etcHosts functionality
import {
  backupHostsFile,
  listHostsAndPrint,
  removeHost,
  restoreHostsFile,
  setHost,
} from './etcHosts/helpers.js';

// Import process management functionality
import {setupUsers} from './mongo/user/setupUsers.js';
import {findChildrenPIDs} from './pid/findChildrenPIDs.js';

// Import postgres functionality
import {
  generatePostgresCertConfigsMain,
  generatePostgresCertsMain,
  getPostgresRunConfig,
  postgresRunConfigSchema,
  scaffoldPostgresConfig,
  setupDatabases,
  setupUsers as setupPostgresUsers,
  startPostgresInstance,
  stopPostgresInstance,
  validatePostgresConfig,
} from './postgres/index.js';

// Import run-env functionality
import {runWithEnvMain} from './runEnv/index.js';

// Import security functionality
import {generateJwtSecret, generatePassword} from './security/index.js';

const program = new Command();

program
  .name('softkave-forerunner')
  .description('Softkave internal application runner & helpers')
  .version(await getVersion('unknown'));

// ============================================================================
// CERTS SUB-PROGRAM
// ============================================================================
const certsProgram = program
  .command('certs')
  .description('CA and certificates generator for softkave infra');

// CA command
certsProgram
  .command('ca')
  .description('Generate a Certificate Authority')
  .requiredOption('-c, --config <path>', 'Path to CA configuration JSON file')
  .option('-f, --force', 'Force regeneration even if CA already exists')
  .option('-w, --cwd <path>', 'Working directory')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});

    try {
      // Parse and validate CLI options
      const cliOptions = GenerateCertsCLIOptionsSchema.parse({
        force: options.force,
        config: options.config,
        cwd: options.cwd,
        silent: options.silent,
      });

      await generateCA({opts: cliOptions, logger});
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Certificate command
certsProgram
  .command('cert')
  .description('Generate a signed certificate using a CA')
  .requiredOption(
    '-c, --config <path>',
    'Path to certificate configuration JSON file'
  )
  .option(
    '-f, --force',
    'Force regeneration even if certificate already exists'
  )
  .option('-w, --cwd <path>', 'Working directory')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});

    try {
      // Parse and validate CLI options
      const cliOptions = GenerateCertsCLIOptionsSchema.parse({
        force: options.force,
        config: options.config,
        cwd: options.cwd,
        silent: options.silent,
      });

      await generateCert({opts: cliOptions, logger});
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// ============================================================================
// MONGO SUB-PROGRAM
// ============================================================================
const mongoProgram = program
  .command('mongo')
  .description('MongoDB management utilities');

// Scaffold MongoDB configuration
mongoProgram
  .command('scaffold-config')
  .description('Generate MongoDB configuration file')
  .option('--defaults', 'Use default values instead of prompting', false)
  .option('-o, --output <path>', 'Output file path', './mongo-run-config.json')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      await scaffoldMongoConfig({
        outputPath: options.output,
        logger,
        useDefaults: options.defaults,
      });
      logger.log('✅ MongoDB configuration generated successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Validate MongoDB configuration
mongoProgram
  .command('validate-config')
  .description('Validate MongoDB configuration file and print errors')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      await validateMongoConfig({
        configPath: options.config,
        logger,
      });
    } catch (error) {
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Generate MongoDB certificates (configs and certs)
mongoProgram
  .command('generate-certs')
  .description('Generate MongoDB certificate configs and certificates')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option('--overwriteConfig', 'Overwrite existing config', false)
  .option('--overwriteCA', 'Overwrite existing CA', false)
  .option('--overwriteCerts', 'Overwrite existing certs', false)
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
      });
      await generateMongoCertConfigsMain({
        mongoRunConfig,
        overwrite: options.overwriteConfig,
      });
      await generateMongoCertsMain({
        mongoRunConfig,
        overwriteConfig: options.overwriteConfig,
        overwriteCA: options.overwriteCA,
        overwriteCerts: options.overwriteCerts,
        logger,
      });
      logger.log('✅ MongoDB certificates generation completed successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Start MongoDB instances
mongoProgram
  .command('start')
  .description(
    'Start MongoDB instances and setup replica set (if not already setup)'
  )
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option(
    '--no-setup-replica-set',
    'Skip replica set setup (default: setup replica set)'
  )
  .option(
    '--setup-users',
    'Setup MongoDB users after starting instances',
    false
  )
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
      });

      await startMongoMain({
        mongoRunConfig,
        logger,
        waitUntilListening: true,
        shouldSetupReplicaSet: options.setupReplicaSet ?? true,
        shouldSetupUsers: options.setupUsers ?? false,
      });
      logger.log('✅ MongoDB instances started successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Stop MongoDB instances
mongoProgram
  .command('stop')
  .description('Stop MongoDB instances')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
      });

      await stopMongoMain({mongoRunConfig, logger});
      logger.log('✅ MongoDB instances stopped successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Setup replica set (deprecated: use 'start --setup-users' instead)
mongoProgram
  .command('setup-replica-set')
  .description(
    'Setup MongoDB replica set and users (deprecated: use "start --setup-users" instead)'
  )
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
      });
      await setupReplicaSetMain({mongoRunConfig, logger});
      logger.log('✅ MongoDB replica set setup completed successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Setup MongoDB users
mongoProgram
  .command('setup-users')
  .description('Setup MongoDB users')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
      });
      await setupUsers({mongoRunConfig, logger});
      logger.log('✅ MongoDB users setup completed successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Print MongoDB URI
mongoProgram
  .command('print-uri')
  .description('Print MongoDB connection URI using configuration')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option(
    '--connection-type <type>',
    'Connection type: instance or replicaSet',
    'replicaSet'
  )
  .option(
    '--instance-number <number>',
    'Instance number (for instance connection type)',
    '1'
  )
  .option('-u, --username <username>', 'Username for authentication')
  .option('-p, --password <password>', 'Password for authentication')
  .option('--prefer-localhost', 'Prefer localhost over other hostnames', false)
  .option(
    '--server-selection-timeout <ms>',
    'Server selection timeout in milliseconds',
    '5000'
  )
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
      });

      const connectionType = options.connectionType as
        | 'instance'
        | 'replicaSet';
      const instanceNumber = parseInt(options.instanceNumber, 10);
      const serverSelectionTimeoutMs = parseInt(
        options.serverSelectionTimeout,
        10_000 // 10 seconds
      );

      await printMongoUriMain({
        mongoRunConfig,
        logger,
        connectionType,
        instanceNumber,
        username: options.username,
        password: options.password,
        preferLocalhost: options.preferLocalhost,
        serverSelectionTimeoutMs,
      });
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Print MongoDB replica set status
mongoProgram
  .command('replica-set-status')
  .description('Print MongoDB replica set status')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option('--prefer-localhost', 'Prefer localhost over other hostnames', false)
  .option(
    '--ping <ping>',
    'Ping option: all, repl, or instance number (for instance connection type)',
    'all'
  )
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
      });

      await getReplicaSetStatus({
        mongoRunConfig,
        logger,
        preferLocalhost: options.preferLocalhost,
        printStatus: true,
        ping: options.ping,
      });
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Restart MongoDB replica set (rolling restart)
mongoProgram
  .command('restart')
  .description('Rolling restart of MongoDB replica set members')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option('--force', 'Force restart without step-down', false)
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
      });
      await restartMongo({
        mongoRunConfig,
        logger,
        force: options.force,
      });
      logger.log('✅ MongoDB rolling restart completed successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// ============================================================================
// POSTGRES SUB-PROGRAM
// ============================================================================
const postgresProgram = program
  .command('postgres')
  .description('PostgreSQL management utilities');

// Scaffold PostgreSQL configuration
postgresProgram
  .command('scaffold-config')
  .description('Generate PostgreSQL configuration file')
  .option('--defaults', 'Use default values instead of prompting', false)
  .option(
    '-o, --output <path>',
    'Output file path',
    './postgres-run-config.json'
  )
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      await scaffoldPostgresConfig({
        outputPath: options.output,
        logger,
        useDefaults: options.defaults,
      });
      logger.log('✅ PostgreSQL configuration generated successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Validate PostgreSQL configuration
postgresProgram
  .command('validate-config')
  .description('Validate PostgreSQL configuration file and print errors')
  .requiredOption('-c, --config <path>', 'Path to postgres run config file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      await validatePostgresConfig({
        configPath: options.config,
        logger,
      });
    } catch (error) {
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Generate PostgreSQL certificates
postgresProgram
  .command('generate-certs')
  .description('Generate PostgreSQL SSL/TLS certificates')
  .requiredOption('-c, --config <path>', 'Path to postgres run config file')
  .option('--overwriteConfig', 'Overwrite existing config', false)
  .option('--overwriteCA', 'Overwrite existing CA', false)
  .option('--overwriteCerts', 'Overwrite existing certs', false)
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const postgresRunConfig = await getPostgresRunConfig({
        postgresRunConfigFilepath: options.config,
      });
      await generatePostgresCertConfigsMain({
        postgresRunConfig,
        overwrite: options.overwriteConfig,
      });
      await generatePostgresCertsMain({
        postgresRunConfig,
        overwriteConfig: options.overwriteConfig,
        overwriteCA: options.overwriteCA,
        overwriteCerts: options.overwriteCerts,
        logger,
      });
      logger.log(
        '✅ PostgreSQL certificates generation completed successfully'
      );
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Start PostgreSQL instance
postgresProgram
  .command('start')
  .description('Start PostgreSQL instance')
  .option('-c, --config <path>', 'Path to postgres run config file')
  .option('--port <port>', 'Port number (required if no config)')
  .option('--container-name <name>', 'Container name (required if no config)')
  .option('--version <version>', 'PostgreSQL version')
  .option('--volume-name <name>', 'Volume name')
  .option('--keep', 'Keep data across restarts', false)
  .option(
    '--user <username>',
    'Admin username (with --password enables auth for quick setup)'
  )
  .option(
    '--password <password>',
    'Admin password (with --user enables auth for quick setup)'
  )
  .option('--db <dbname>', 'Default database name')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      let postgresRunConfig;

      if (options.config) {
        postgresRunConfig = await getPostgresRunConfig({
          postgresRunConfigFilepath: options.config,
        });
      } else {
        // Quick/dirty setup for dev or test: no config file, no SSL, no certs
        if (!options.port || !options.containerName) {
          throw new Error(
            '--port and --container-name are required when --config is not provided'
          );
        }

        const authEnabled = Boolean(options.user) && Boolean(options.password);

        const config: any = {
          port: parseInt(options.port, 10),
          containerName: options.containerName,
          authorization: authEnabled ? 'enabled' : 'disabled',
          ssl: 'disabled',
        };

        if (options.version) config.postgresVersion = options.version;
        if (options.volumeName) config.volumeName = options.volumeName;
        if (options.keep) config.keep = true;

        if (authEnabled) {
          config.users = [
            {
              username: options.user,
              password: options.password,
            },
          ];
        }

        if (options.db) {
          config.dbs = [options.db];
        }

        postgresRunConfig = postgresRunConfigSchema.parse(config);
      }

      await startPostgresInstance({
        postgresRunConfig,
        logger,
        waitUntilListening: true,
      });
      logger.log('✅ PostgreSQL instance started successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Stop PostgreSQL instance
postgresProgram
  .command('stop')
  .description('Stop PostgreSQL instance')
  .option('-c, --config <path>', 'Path to postgres run config file')
  .option('--container-name <name>', 'Container name (required if no config)')
  .option('--remove-volume', 'Remove volume on stop', false)
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      let containerName: string;
      let postgresRunConfig: any;

      if (options.config) {
        postgresRunConfig = await getPostgresRunConfig({
          postgresRunConfigFilepath: options.config,
        });
        containerName = postgresRunConfig.containerName;
      } else {
        if (!options.containerName) {
          throw new Error(
            '--container-name is required when --config is not provided'
          );
        }
        containerName = options.containerName;
      }

      await stopPostgresInstance({
        containerName,
        postgresRunConfig,
        logger,
        removeVolume: options.removeVolume,
      });
      logger.log('✅ PostgreSQL instance stopped successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Setup PostgreSQL users
postgresProgram
  .command('setup-users')
  .description('Setup PostgreSQL users (excluding admin)')
  .requiredOption('-c, --config <path>', 'Path to postgres run config file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const postgresRunConfig = await getPostgresRunConfig({
        postgresRunConfigFilepath: options.config,
      });
      await setupPostgresUsers({postgresRunConfig, logger});
      logger.log('✅ PostgreSQL users setup completed successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Setup PostgreSQL databases
postgresProgram
  .command('setup-dbs')
  .description('Setup PostgreSQL databases')
  .requiredOption('-c, --config <path>', 'Path to postgres run config file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const postgresRunConfig = await getPostgresRunConfig({
        postgresRunConfigFilepath: options.config,
      });
      await setupDatabases({postgresRunConfig, logger});
      logger.log('✅ PostgreSQL databases setup completed successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// ============================================================================
// ETC HOSTS SUB-PROGRAM
// ============================================================================
const etcHostsProgram = program
  .command('etc-hosts')
  .description('Manage /etc/hosts file entries');

// Set host
etcHostsProgram
  .command('set')
  .description('Set hostname to IP (defaults to 127.0.0.1 if no IP provided)')
  .argument('<hostname>', 'hostname to set')
  .argument('[ip]', 'IP address (defaults to 127.0.0.1)', '127.0.0.1')
  .option('-f, --hosts-file <path>', 'path to hosts file', '/etc/hosts')
  .option('-s, --silent', 'silent mode')
  .action((hostname: string, ip: string, options) => {
    const logger = new ConsoleForeLogger({silent: options.silent});

    try {
      setHost({
        hostname,
        ip,
        hostsFilePath: options.hostsFile,
        logger,
      });
      logger.log(`✅ Host ${hostname} set to ${ip} successfully`);
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Remove host
etcHostsProgram
  .command('remove')
  .description('Remove hostname from hosts file')
  .argument('<hostname>', 'hostname to remove')
  .option('-f, --hosts-file <path>', 'path to hosts file', '/etc/hosts')
  .option('-s, --silent', 'silent mode')
  .action((hostname: string, options) => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      removeHost({
        hostname,
        hostsFilePath: options.hostsFile,
        logger,
      });
      logger.log(`✅ Host ${hostname} removed successfully`);
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// List hosts
etcHostsProgram
  .command('list')
  .description('List all current host entries')
  .option('-f, --hosts-file <path>', 'path to hosts file', '/etc/hosts')
  .option('-s, --silent', 'silent mode')
  .action(options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      listHostsAndPrint({
        hostsFilePath: options.hostsFile,
        logger,
      });
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Backup hosts file
etcHostsProgram
  .command('backup')
  .description('Create a backup of the current hosts file')
  .option('-f, --hosts-file <path>', 'path to hosts file', '/etc/hosts')
  .option(
    '-b, --backup-file <path>',
    'path to backup file',
    '/etc/hosts.backup'
  )
  .option('-s, --silent', 'silent mode')
  .action(options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      backupHostsFile({
        hostsFilePath: options.hostsFile,
        backupFilePath: options.backupFile,
        logger,
      });
      logger.log('✅ Hosts file backup created successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Restore hosts file
etcHostsProgram
  .command('restore')
  .description('Restore hosts file from backup')
  .option('-f, --hosts-file <path>', 'path to hosts file', '/etc/hosts')
  .option(
    '-b, --backup-file <path>',
    'path to backup file',
    '/etc/hosts.backup'
  )
  .option('-s, --silent', 'silent mode')
  .action(options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      restoreHostsFile({
        hostsFilePath: options.hostsFile,
        backupFilePath: options.backupFile,
        logger,
      });
      logger.log('✅ Hosts file restored successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// ============================================================================
// PROCESS MANAGEMENT SUB-PROGRAM
// ============================================================================
const pmProgram = program
  .command('pm')
  .description('Process management utilities');

// Find children PIDs command
pmProgram
  .command('children-pids')
  .description('Find all child PIDs of a given parent PID')
  .argument('<pid>', 'Parent process ID to find children for')
  .option('-s, --silent', 'Silent mode')
  .action(async (pid: string, options) => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const parentPid = parseInt(pid, 10);
      if (isNaN(parentPid)) {
        throw new Error(`Invalid PID: ${pid}. Must be a number.`);
      }

      const childrenPids = await findChildrenPIDs(parentPid);

      if (childrenPids.length === 0) {
        logger.log(`No child processes found for PID ${parentPid}`);
      } else {
        logger.log(`Child PIDs of ${parentPid}:`);
        childrenPids.forEach(childPid => {
          logger.log(`  ${childPid}`);
        });
        logger.log(`Total: ${childrenPids.length} child process(es)`);
      }
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// ============================================================================
// RUN-ENV SUB-PROGRAM
// ============================================================================
program
  .command('run-env')
  .allowExcessArguments()
  .description(
    'Run a command with a selected .env* file (pass command after --)'
  )
  .option(
    '-w, --cwd <path>',
    'Working directory to scan for .env* and run the command'
  )
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    const dashIndex = process.argv.indexOf('--');
    const command =
      dashIndex >= 0 ? process.argv.slice(dashIndex + 1).join(' ') : '';
    if (!command.trim()) {
      logger.error(
        'Usage: softkave-forerunner run-env [options] -- <command> [args...]\nExample: softkave-forerunner run-env -- npm run dev'
      );
      logger.onSilentFail(new Error('Missing command after --'));
      process.exit(1);
    }
    const cwd = options.cwd ? String(options.cwd) : process.cwd();
    try {
      await runWithEnvMain({
        cwd,
        command: command.trim(),
        silent: options.silent,
        logger,
      });
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// ============================================================================
// SECURITY SUB-PROGRAM
// ============================================================================
const securityProgram = program
  .command('security')
  .description('Security utilities for generating passwords and JWT secrets');

// Generate password command
securityProgram
  .command('password')
  .description('Generate production-grade password(s)')
  .option('-c, --count <number>', 'Number of passwords to generate', '1')
  .option('-l, --length <number>', 'Password length', '32')
  .option('--numbers', 'Include numbers', true)
  .option('--no-numbers', 'Exclude numbers')
  .option('--symbols', 'Include symbols', true)
  .option('--no-symbols', 'Exclude symbols')
  .option('--uppercase', 'Include uppercase characters', true)
  .option('--no-uppercase', 'Exclude uppercase characters')
  .option('--lowercase', 'Include lowercase characters', true)
  .option('--no-lowercase', 'Exclude lowercase characters')
  .option('--exclude-similar', 'Exclude visually similar characters', true)
  .option('--no-exclude-similar', 'Allow visually similar characters')
  .option('--strict', 'Require at least one character from each pool', true)
  .option('--no-strict', 'Do not require characters from each pool')
  .option('--exclude <chars>', 'Characters to exclude from password', '')
  .option(
    '--symbols-set <chars>',
    'Custom symbols to use (overrides default symbols)',
    ''
  )
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const count = parseInt(options.count, 10);
      if (isNaN(count) || count < 1) {
        throw new Error('Count must be a positive integer');
      }

      const length = parseInt(options.length, 10);
      if (isNaN(length) || length < 1) {
        throw new Error('Length must be a positive integer');
      }

      // Handle boolean flags - commander.js sets them to false when --no-* is
      // used, otherwise they're undefined, so we default to true for enabled
      // flags. Note: We check !== false because false means explicitly
      // disabled, undefined means use default (true)
      const passwordOptions: Parameters<typeof generatePassword>[0] = {
        count,
        length,
        numbers: options.numbers !== false,
        symbols:
          options.symbolsSet !== ''
            ? options.symbolsSet
            : options.symbols !== false,
        uppercase: options.uppercase !== false,
        lowercase: options.lowercase !== false,
        excludeSimilarCharacters: options.excludeSimilar !== false,
        strict: options.strict !== false,
        exclude: options.exclude,
      };

      const passwords = generatePassword(passwordOptions);
      const passwordArray = Array.isArray(passwords) ? passwords : [passwords];

      passwordArray.forEach(password => {
        logger.log(password);
      });
    } catch (error) {
      logger.error('❌ Error:', error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Generate JWT secret command
securityProgram
  .command('jwt-secret')
  .description('Generate production-grade JWT secret(s)')
  .option('-c, --count <number>', 'Number of secrets to generate', '1')
  .option('-l, --length <number>', 'Length in bytes of each secret', '64')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const count = parseInt(options.count, 10);
      if (isNaN(count) || count < 1) {
        throw new Error('Count must be a positive integer');
      }

      const length = parseInt(options.length, 10);
      if (isNaN(length) || length < 1) {
        throw new Error('Length must be a positive integer');
      }

      const secrets = generateJwtSecret(count, length);
      const secretArray = Array.isArray(secrets) ? secrets : [secrets];

      secretArray.forEach(secret => {
        logger.log(secret);
      });
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// ============================================================================
// HELP AND DEFAULT ACTIONS
// ============================================================================

// Add help command for the main program
program
  .command('help')
  .description('Show detailed help information')
  .action(() => {
    console.log(`
Softkave Forerunner - Internal Application Runner & Helpers

USAGE:
  softkave-forerunner <command> [subcommand] [options]

COMMANDS:
  certs                    CA and certificates generator
    ca                     Generate a Certificate Authority
    cert                   Generate a signed certificate using a CA

  mongo                    MongoDB management utilities
    generate-certs         Generate MongoDB certificates
    generate-cert-configs  Generate MongoDB certificate configurations
    start                  Start MongoDB instances
    stop                   Stop MongoDB instances
    setup-replica-set      Setup MongoDB replica set (deprecated: use "start --setup-users")
    setup-users            Setup MongoDB users
    print-uri              Print MongoDB connection URI using configuration
    replica-set-status     Print MongoDB replica set status
    restart                Rolling restart of replica set members

  postgres                 PostgreSQL management utilities
    scaffold-config        Generate PostgreSQL configuration file
    start                  Start PostgreSQL instance
    stop                   Stop PostgreSQL instance
    setup-users            Setup PostgreSQL users (excluding admin)
    setup-dbs              Setup PostgreSQL databases

  etc-hosts                Manage /etc/hosts file entries
    set                    Set hostname to IP
    remove                 Remove hostname from hosts file
    list                   List all current host entries
    backup                 Create a backup of the current hosts file
    restore                Restore hosts file from backup

  pm                       Process management utilities
    children-pids          Find all child PIDs of a given parent PID

  run-env                  Run a command with a selected .env* file
                           Usage: run-env [options] -- <command> [args...]

  security                 Security utilities
    password               Generate production-grade password(s)
    jwt-secret             Generate production-grade JWT secret(s)

  help                     Show this help message

EXAMPLES:
  # Generate a CA
  softkave-forerunner certs ca -c ca-config.json

  # Generate a certificate
  softkave-forerunner certs cert -c cert-config.json

  # Setup MongoDB replica set (requires config file)
  softkave-forerunner mongo setup-replica-set -c mongo-config.json

  # Start PostgreSQL instance
  softkave-forerunner postgres start --port 5432 --container-name postgres-db

  # Stop PostgreSQL instance
  softkave-forerunner postgres stop --container-name postgres-db

  # Set a host entry
  softkave-forerunner etc-hosts set example.com 127.0.0.1

  # List all host entries
  softkave-forerunner etc-hosts list

  # Backup hosts file
  softkave-forerunner etc-hosts backup

  # Find child processes of a PID
  softkave-forerunner pm children-pids 1234

  # Run a command with a selected .env file
  softkave-forerunner run-env -- npm run dev

  # Generate a password
  softkave-forerunner security password

  # Generate multiple passwords
  softkave-forerunner security password --count 5

  # Generate a JWT secret
  softkave-forerunner security jwt-secret

  # Generate multiple JWT secrets
  softkave-forerunner security jwt-secret --count 3

For more information about a specific command, use:
  softkave-forerunner <command> --help
  softkave-forerunner <command> <subcommand> --help
`);
  });

// Default action - show help if no command provided
if (process.argv.length === 2) {
  program.help();
}

program.parse();
