#!/usr/bin/env node
/* eslint-disable n/no-process-exit */

import {Command} from 'commander';
import {readFileSync} from 'fs';
import {ConsoleForeLogger} from './utils/foreLogger/ConsoleForeLogger.js';

// Import certs functionality
import {CAGenerator} from './certs/caGenerator.js';
import {CertGenerator} from './certs/certGenerator.js';
import {
  CAConfigSchema,
  CertConfigSchema,
  CLIOptionsSchema,
} from './certs/types.js';

// Import mongo functionality
import {
  downloadMongo,
  generateMongoCertConfigsMain,
  generateMongoCertsMain,
  generateMongodConfigsMain,
  runMongo,
  setupReplicaSetMain,
  startMongodInstancesMain,
  stopMongodInstancesMain,
  writeMongoUser,
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

const program = new Command();

program
  .name('forerunner')
  .description('Softkave internal application runner & helpers')
  .version('0.3.0');

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
      const cliOptions = CLIOptionsSchema.parse({
        force: options.force,
        config: options.config,
        cwd: options.cwd,
        silent: options.silent,
      });

      // Read and parse config file
      if (cliOptions.cwd) {
        process.chdir(cliOptions.cwd);
      }
      const configContent = readFileSync(cliOptions.config, 'utf-8');
      const config = CAConfigSchema.parse(JSON.parse(configContent));

      // Generate CA
      const caGenerator = new CAGenerator({config, logger});
      await caGenerator.generate(cliOptions.force);

      logger.log('✅ CA generation completed successfully');
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
      const cliOptions = CLIOptionsSchema.parse({
        force: options.force,
        config: options.config,
        cwd: options.cwd,
        silent: options.silent,
      });

      // Read and parse config file
      if (cliOptions.cwd) {
        process.chdir(cliOptions.cwd);
      }
      const configContent = readFileSync(cliOptions.config, 'utf-8');
      const config = CertConfigSchema.parse(JSON.parse(configContent));

      // Generate certificate
      const certGenerator = new CertGenerator({config, logger});
      await certGenerator.generate(cliOptions.force);

      logger.log('✅ Certificate generation completed successfully');
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

// Download MongoDB
mongoProgram
  .command('download')
  .description('Download MongoDB binaries')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
        checkExisting: false,
      });
      await downloadMongo({mongoRunConfig, logger});
      logger.log('✅ MongoDB download completed successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Generate MongoDB certificates
mongoProgram
  .command('generate-certs')
  .description('Generate MongoDB certificates')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
        checkExisting: false,
      });
      await generateMongoCertsMain({mongoRunConfig});
      logger.log('✅ MongoDB certificates generation completed successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Generate MongoDB certificate configs
mongoProgram
  .command('generate-cert-configs')
  .description('Generate MongoDB certificate configurations')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
        checkExisting: false,
      });
      await generateMongoCertConfigsMain({mongoRunConfig});
      logger.log(
        '✅ MongoDB certificate configs generation completed successfully'
      );
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Generate MongoDB configurations
mongoProgram
  .command('generate-configs')
  .description('Generate MongoDB configurations')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
        checkExisting: false,
      });
      await generateMongodConfigsMain({mongoRunConfig});
      logger.log('✅ MongoDB configurations generation completed successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Start MongoDB instances
mongoProgram
  .command('start')
  .description('Start MongoDB instances')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
        checkExisting: false,
      });
      await startMongodInstancesMain({mongoRunConfig, logger});
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
        checkExisting: false,
      });
      await stopMongodInstancesMain({mongoRunConfig, logger});
      logger.log('✅ MongoDB instances stopped successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Setup replica set
mongoProgram
  .command('setup-replica-set')
  .description('Setup MongoDB replica set')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
        checkExisting: false,
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
        checkExisting: false,
      });
      // Note: setupMongoUsersMain is not exported, so this command is disabled
      logger.log(
        '⚠️  MongoDB users setup command is not available in this version'
      );
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Write MongoDB users
mongoProgram
  .command('write-users')
  .description('Write MongoDB users configuration')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .requiredOption('-u, --users <path>', 'Path to users JSON file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
        checkExisting: false,
      });
      const usersContent = readFileSync(options.users, 'utf-8');
      const users = JSON.parse(usersContent);
      await writeMongoUser({mongoRunConfig, users, logger});
      logger.log('✅ MongoDB users configuration written successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Run MongoDB
mongoProgram
  .command('run')
  .description('Run MongoDB with configuration')
  .requiredOption('-c, --config <path>', 'Path to mongo run config file')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ConsoleForeLogger({silent: options.silent});
    try {
      const mongoRunConfig = await getMongoRunConfig({
        mongoRunConfigFilepath: options.config,
        checkExisting: false,
      });
      await runMongo({mongoRunConfig, logger});
      logger.log('✅ MongoDB run completed successfully');
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
  forerunner <command> [subcommand] [options]

COMMANDS:
  certs                    CA and certificates generator
    ca                     Generate a Certificate Authority
    cert                   Generate a signed certificate using a CA

  mongo                    MongoDB management utilities
    download               Download MongoDB binaries
    generate-certs         Generate MongoDB certificates
    generate-cert-configs  Generate MongoDB certificate configurations
    generate-configs       Generate MongoDB configurations
    start                  Start MongoDB instances
    stop                   Stop MongoDB instances
    setup-replica-set      Setup MongoDB replica set
    setup-users            Setup MongoDB users (requires config file)
    write-users            Write MongoDB users configuration
    run                    Run MongoDB with configuration

  etc-hosts                Manage /etc/hosts file entries
    set                    Set hostname to IP
    remove                 Remove hostname from hosts file
    list                   List all current host entries
    backup                 Create a backup of the current hosts file
    restore                Restore hosts file from backup

  help                     Show this help message

EXAMPLES:
  # Generate a CA
  forerunner certs ca -c ca-config.json

  # Generate a certificate
  forerunner certs cert -c cert-config.json

  # Download MongoDB (requires config file)
  forerunner mongo download -c mongo-config.json

  # Start MongoDB instances (requires config file)
  forerunner mongo start -c mongo-config.json

  # Set a host entry
  forerunner etc-hosts set example.com 127.0.0.1

  # List all host entries
  forerunner etc-hosts list

  # Backup hosts file
  forerunner etc-hosts backup

For more information about a specific command, use:
  forerunner <command> --help
  forerunner <command> <subcommand> --help
`);
  });

// Default action - show help if no command provided
if (process.argv.length === 2) {
  program.help();
}

program.parse();
