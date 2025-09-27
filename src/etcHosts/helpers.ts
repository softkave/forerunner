/* eslint-disable n/no-process-exit */

import assert from 'assert';
import {execSync} from 'child_process';
import {readFileSync, writeFileSync} from 'fs';
import {exists} from 'fs-extra';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';

const HOSTS_FILE = '/etc/hosts';
const BACKUP_FILE = '/etc/hosts.backup';

export interface HostEntry {
  ip: string;
  hostname: string;
  comment?: string;
}

export function parseHostsFile(params: {content: string}): HostEntry[] {
  const {content} = params;
  const lines = content.split('\n');
  const entries: HostEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        entries.push({
          ip: parts[0],
          hostname: parts[1],
          comment: parts.slice(2).join(' '),
        });
      }
    }
  }

  return entries;
}

export function formatHostsFile(params: {entries: HostEntry[]}): string {
  const {entries} = params;
  const uniqueEntries = entries.filter(
    (entry, index, self) =>
      index === self.findIndex(t => t.hostname === entry.hostname)
  );
  const lines: string[] = [];

  // Add header comment
  lines.push('# Hosts file applied by etcHosts script');
  lines.push('# Generated on: ' + new Date().toISOString());
  lines.push('');

  // Add entries
  for (const entry of uniqueEntries) {
    const line = `${entry.ip}\t${entry.hostname}`;
    if (entry.comment) {
      lines.push(line + '\t' + entry.comment);
    } else {
      lines.push(line);
    }
  }

  return lines.join('\n') + '\n';
}

export function backupHostsFile(params: {
  hostsFilePath?: string;
  backupFilePath?: string;
  logger: IForeLogger;
  dontExitOnError?: boolean;
}): void {
  const {
    hostsFilePath = HOSTS_FILE,
    backupFilePath = BACKUP_FILE,
    logger = new ConsoleForeLogger({silent: true}),
    dontExitOnError = false,
  } = params;
  try {
    execSync(`cp ${hostsFilePath} ${backupFilePath}`, {stdio: 'inherit'});
    logger.log(`Backup created at ${BACKUP_FILE}`);
  } catch (error) {
    logger.error('Failed to create backup:', error);
    logger.onSilentFail(error);
    if (!dontExitOnError) {
      process.exit(1);
    }
  }
}

export function restoreHostsFile(params: {
  hostsFilePath?: string;
  backupFilePath?: string;
  logger: IForeLogger;
  dontExitOnError?: boolean;
}): void {
  const {
    hostsFilePath = HOSTS_FILE,
    backupFilePath = BACKUP_FILE,
    logger = new ConsoleForeLogger({silent: true}),
    dontExitOnError = false,
  } = params;
  try {
    execSync(`cp ${backupFilePath} ${hostsFilePath}`, {stdio: 'inherit'});
    logger.log('Hosts file restored from backup');
  } catch (error) {
    logger.error('Failed to restore from backup:', error);
    logger.onSilentFail(error);
    if (!dontExitOnError) {
      process.exit(1);
    }
  }
}

export function readHostsFile<TDontExitOnError extends boolean>(params: {
  hostsFilePath?: string;
  logger: IForeLogger;
  dontExitOnError?: TDontExitOnError;
}): TDontExitOnError extends true ? string | undefined : string {
  const {
    hostsFilePath = HOSTS_FILE,
    logger = new ConsoleForeLogger({silent: true}),
    dontExitOnError = false,
  } = params;
  try {
    return readFileSync(hostsFilePath, 'utf8');
  } catch (error) {
    logger.error('Failed to read hosts file:', error);
    logger.onSilentFail(error);
    if (!dontExitOnError) {
      process.exit(1);
    }

    return undefined as TDontExitOnError extends true
      ? string | undefined
      : string;
  }
}

export async function writeHostsFile(params: {
  content: string;
  hostsFilePath?: string;
  logger: IForeLogger;
  dontExitOnError?: boolean;
}): Promise<void> {
  const {
    content,
    hostsFilePath = HOSTS_FILE,
    logger = new ConsoleForeLogger({silent: true}),
    dontExitOnError = false,
  } = params;

  try {
    // Check if we have write permissions
    if (!(await exists(hostsFilePath))) {
      logger.error('Hosts file does not exist');
      logger.onSilentFail(new Error('Hosts file does not exist'));
      if (!dontExitOnError) {
        process.exit(1);
      }
      return;
    }

    // Try to write directly first
    try {
      writeFileSync(hostsFilePath, content, 'utf8');
      logger.log('Hosts file updated successfully');
      return;
    } catch (writeError) {
      logger.log('Direct write failed, attempting with sudo...');
    }

    // If direct write fails, use sudo
    const tempFile = '/tmp/hosts.tmp';
    writeFileSync(tempFile, content, 'utf8');
    execSync(`sudo cp ${tempFile} ${hostsFilePath}`, {stdio: 'inherit'});
    execSync(`rm ${tempFile}`, {stdio: 'inherit'});
    logger.log('Hosts file updated successfully with sudo');
  } catch (error) {
    logger.error('Failed to write hosts file:', error);
    logger.onSilentFail(error);
    restoreHostsFile({dontExitOnError, logger});
    if (!dontExitOnError) {
      process.exit(1);
    }
  }
}

export function setHost(params: {
  hostsFilePath?: string;
  dontExitOnError?: boolean;
  logger: IForeLogger;
  hostname: string;
  ip?: string;
}): void {
  const {
    hostsFilePath = HOSTS_FILE,
    dontExitOnError = false,
    logger = new ConsoleForeLogger({silent: true}),
    hostname,
    ip = '127.0.0.1',
  } = params;

  logger.log(`Setting ${hostname} to ${ip}`);

  const content = readHostsFile({hostsFilePath, logger});
  assert.ok(content, 'Hosts file not found');
  const entries = parseHostsFile({content});
  let madeChange = false;

  // Check if hostname already exists
  const existingIndex = entries.findIndex(entry => entry.hostname === hostname);

  if (existingIndex !== -1) {
    // Update existing entry
    entries[existingIndex].ip = ip;
    logger.log(`Updated existing entry for ${hostname}`);
    madeChange = true;
  } else {
    // Add new entry
    entries.push({ip, hostname});
    logger.log(`Added new entry for ${hostname}`);
    madeChange = true;
  }

  if (madeChange) {
    const newContent = formatHostsFile({entries});
    writeHostsFile({
      content: newContent,
      hostsFilePath,
      logger,
      dontExitOnError,
    });
  }
}

export function removeHost(params: {
  hostsFilePath?: string;
  dontExitOnError?: boolean;
  logger: IForeLogger;
  hostname: string;
}): void {
  const {
    hostsFilePath = HOSTS_FILE,
    dontExitOnError = false,
    logger = new ConsoleForeLogger({silent: true}),
    hostname,
  } = params;

  logger.log(`Removing ${hostname}`);

  const content = readHostsFile({hostsFilePath, logger});
  assert.ok(content, 'Hosts file not found');
  const entries = parseHostsFile({content});

  const initialLength = entries.length;
  const filteredEntries = entries.filter(entry => entry.hostname !== hostname);

  if (filteredEntries.length === initialLength) {
    logger.log(`Hostname ${hostname} not found in hosts file`);
    return;
  }

  logger.log(`Removed ${hostname} from hosts file`);
  const newContent = formatHostsFile({entries: filteredEntries});
  writeHostsFile({content: newContent, hostsFilePath, logger, dontExitOnError});
}

export function listHosts(params: {
  hostsFilePath?: string;
  dontExitOnError?: boolean;
  logger: IForeLogger;
}): HostEntry[] {
  const {
    hostsFilePath = HOSTS_FILE,
    dontExitOnError = false,
    logger = new ConsoleForeLogger({silent: true}),
  } = params;

  const content = readHostsFile({hostsFilePath, dontExitOnError, logger});
  assert.ok(content, 'Hosts file not found');
  const entries = parseHostsFile({content});

  if (entries.length === 0) {
    return [];
  }

  return entries;
}

export function listHostsAndPrint(params: {
  hostsFilePath?: string;
  dontExitOnError?: boolean;
  logger: IForeLogger;
}): void {
  const {
    hostsFilePath = HOSTS_FILE,
    dontExitOnError = false,
    logger = new ConsoleForeLogger({silent: true}),
  } = params;

  const entries = listHosts({hostsFilePath, dontExitOnError, logger});

  if (entries.length === 0) {
    logger.log('No host entries found');
    return;
  }

  logger.log('Current host entries:');
  entries.forEach(entry => {
    logger.log(`  - IP: ${entry.ip}`);
    logger.log(`    Hostname: ${entry.hostname}`);
    if (entry.comment) {
      logger.log(`    Comment: ${entry.comment}`);
    }
  });
}
