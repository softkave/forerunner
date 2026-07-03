import select from '@inquirer/select';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {
  getHostnamesNeedingHostsEntry,
  getUnresolvableHostnames,
  HostnamePort,
} from './hostnameResolution.js';
import {canWriteHostsFileDirectly, setHosts} from './helpers.js';

export type EtcHostsSetupMode = 'prompt' | 'add' | 'manual' | 'skip';

export interface EnsureHostnamesResolvableParams {
  hostnames: string[];
  /** When set, reachability to each port is checked (preferred). */
  hostnamePorts?: HostnamePort[];
  ip?: string;
  mode?: EtcHostsSetupMode;
  hostsFilePath?: string;
  logger: IForeLogger;
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function promptEtcHostsChoice(params: {
  hostnames: string[];
  ip: string;
  canWriteDirectly: boolean;
  logger: IForeLogger;
}): Promise<'add' | 'manual' | 'skip'> {
  const {hostnames, ip, canWriteDirectly, logger} = params;

  logger.log('The following hostnames are not resolvable from this machine:');
  for (const hostname of hostnames) {
    logger.log(`  - ${hostname}`);
  }

  if (!canWriteDirectly) {
    logger.log(
      'This process does not have permission to write /etc/hosts directly.'
    );
    logger.log(
      'If you choose to add entries automatically, you will be prompted for your sudo password.'
    );
  }

  logger.log(`Entries would map each hostname to ${ip}.`);

  return select({
    message: 'How should /etc/hosts be handled?',
    choices: [
      {
        name: 'Add entries to /etc/hosts automatically',
        value: 'add' as const,
      },
      {
        name: 'I will add them manually (stop now; rerun start when done)',
        value: 'manual' as const,
      },
      {
        name: 'Skip (do not add entries; continue anyway)',
        value: 'skip' as const,
      },
    ],
  });
}

function formatManualInstructions(params: {
  hostnames: string[];
  ip: string;
}): string {
  const lines = params.hostnames.map(hostname => `${params.ip}\t${hostname}`);
  return [
    'Add the following lines to /etc/hosts, then rerun the start command:',
    ...lines,
  ].join('\n');
}

async function findHostnamesNeedingHostsEntry(
  params: EnsureHostnamesResolvableParams & {ip: string}
): Promise<string[]> {
  const {hostnames, hostnamePorts, hostsFilePath, ip} = params;

  if (hostnamePorts && hostnamePorts.length > 0) {
    return getHostnamesNeedingHostsEntry({
      hostnamePorts,
      hostsFilePath,
      targetIp: ip,
    });
  }

  return getUnresolvableHostnames({hostnames, hostsFilePath});
}

export async function ensureHostnamesResolvable(
  params: EnsureHostnamesResolvableParams
): Promise<void> {
  const {
    hostnames,
    ip = '127.0.0.1',
    mode = 'prompt',
    hostsFilePath,
    logger,
  } = params;

  const uniqueHostnames = [...new Set(hostnames)];
  if (uniqueHostnames.length === 0) {
    return;
  }

  const missing = await findHostnamesNeedingHostsEntry({...params, ip});

  if (missing.length === 0) {
    logger.log('All replica set hostnames are resolvable.');
    return;
  }

  let effectiveMode = mode;
  if (effectiveMode === 'prompt' && !isInteractive()) {
    throw new Error(
      'Replica set hostnames are not resolvable and /etc/hosts setup mode is "prompt", but no TTY is available. Set etcHostsSetup to "add", "manual", or "skip" in config or pass --etc-hosts-setup.'
    );
  }

  if (effectiveMode === 'prompt') {
    const canWriteDirectly = await canWriteHostsFileDirectly(hostsFilePath);
    effectiveMode = await promptEtcHostsChoice({
      hostnames: missing,
      ip,
      canWriteDirectly,
      logger,
    });
  }

  if (effectiveMode === 'skip') {
    logger.log('Skipping /etc/hosts setup.');
    return;
  }

  if (effectiveMode === 'manual') {
    throw new Error(formatManualInstructions({hostnames: missing, ip}));
  }

  await setHosts({
    hosts: missing.map(hostname => ({hostname, ip})),
    hostsFilePath,
    logger,
  });

  const stillMissing = await findHostnamesNeedingHostsEntry({...params, ip});
  if (stillMissing.length > 0) {
    throw new Error(
      `Failed to make hostnames resolvable after updating /etc/hosts: ${stillMissing.join(', ')}`
    );
  }

  logger.log('Updated /etc/hosts; hostnames are now resolvable.');
}
