#!/usr/bin/env node
/* eslint-disable n/no-process-exit */

import {Command} from 'commander';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {
  backupHostsFile,
  listHostsAndPrint,
  removeHost,
  restoreHostsFile,
  setHost,
} from './helpers.js';

const program = new Command();

program
  .name('etcHosts')
  .description('Manage /etc/hosts file entries')
  .version('1.0.0');

program
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
    } catch (error) {
      logger.error('An error occurred:', error);
      logger.onSilentFail(error);
    }
  });

program
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
    } catch (error) {
      logger.error('An error occurred:', error);
      logger.onSilentFail(error);
    }
  });

program
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
      logger.error('An error occurred:', error);
      logger.onSilentFail(error);
    }
  });

program
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
    } catch (error) {
      logger.error('An error occurred:', error);
      logger.onSilentFail(error);
    }
  });

program
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
    } catch (error) {
      logger.error('An error occurred:', error);
      logger.onSilentFail(error);
    }
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}
