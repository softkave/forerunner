import dns from 'dns/promises';
import {promises as fsp} from 'fs';
import {HostEntry, parseHostsFile} from './helpers.js';
import {canReachTcpPort} from './reachability.js';

const DEFAULT_HOSTS_FILE = '/etc/hosts';

export type HostnamePort = {hostname: string; port: number};

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function findHostnameInHostsEntries(params: {
  hostname: string;
  entries: HostEntry[];
}): HostEntry | undefined {
  return params.entries.find(entry => entry.hostname === params.hostname);
}

/** IP from /etc/hosts only (no DNS fallback). */
export async function lookupHostsFileIp(params: {
  hostname: string;
  hostsFilePath?: string;
}): Promise<string | undefined> {
  const {hostname, hostsFilePath} = params;

  if (isLocalHostname(hostname)) {
    return '127.0.0.1';
  }

  try {
    const content = await fsp.readFile(
      hostsFilePath ?? DEFAULT_HOSTS_FILE,
      'utf8'
    );
    const entry = findHostnameInHostsEntries({
      hostname,
      entries: parseHostsFile({content}),
    });
    return entry?.ip;
  } catch {
    return undefined;
  }
}

export async function lookupHostnameAddress(params: {
  hostname: string;
  hostsFilePath?: string;
}): Promise<string | undefined> {
  const {hostname, hostsFilePath} = params;

  if (isLocalHostname(hostname)) {
    return '127.0.0.1';
  }

  try {
    const content = await fsp.readFile(
      hostsFilePath ?? DEFAULT_HOSTS_FILE,
      'utf8'
    );
    const entry = findHostnameInHostsEntries({
      hostname,
      entries: parseHostsFile({content}),
    });
    if (entry) {
      return entry.ip;
    }
  } catch {
    // Fall through to DNS lookup.
  }

  try {
    const result = await dns.lookup(hostname);
    return result.address;
  } catch {
    return undefined;
  }
}

export async function getUnresolvableHostnames(params: {
  hostnames: string[];
  hostsFilePath?: string;
}): Promise<string[]> {
  const missing: string[] = [];
  for (const hostname of params.hostnames) {
    const address = await lookupHostnameAddress({
      hostname,
      hostsFilePath: params.hostsFilePath,
    });
    if (!address) {
      missing.push(hostname);
    }
  }
  return missing;
}

/**
 * Hostnames that need a /etc/hosts entry pointing at `targetIp`.
 *
 * A hostname is considered OK when the published TCP port is reachable at its
 * current resolution (IPv4 or IPv6 via DNS or /etc/hosts). When not reachable,
 * an entry is needed unless /etc/hosts already maps the name to `targetIp`.
 */
export async function getHostnamesNeedingHostsEntry(params: {
  hostnamePorts: HostnamePort[];
  hostsFilePath?: string;
  targetIp: string;
  connectTimeoutMs?: number;
}): Promise<string[]> {
  const {
    hostnamePorts,
    hostsFilePath,
    targetIp,
    connectTimeoutMs = 2_000,
  } = params;
  const missing: string[] = [];

  for (const {hostname, port} of hostnamePorts) {
    const needsEntry = await hostnameNeedsHostsEntry({
      hostname,
      port,
      hostsFilePath,
      targetIp,
      connectTimeoutMs,
    });
    if (needsEntry) {
      missing.push(hostname);
    }
  }

  return [...new Set(missing)];
}

async function hostnameNeedsHostsEntry(params: {
  hostname: string;
  port: number;
  hostsFilePath?: string;
  targetIp: string;
  connectTimeoutMs: number;
}): Promise<boolean> {
  const {hostname, port, hostsFilePath, targetIp, connectTimeoutMs} = params;

  const ipInHostsFile = await lookupHostsFileIp({hostname, hostsFilePath});
  if (ipInHostsFile === targetIp) {
    return false;
  }
  if (ipInHostsFile !== undefined) {
    return true;
  }

  if (
    await canReachTcpPort({host: hostname, port, timeoutMs: connectTimeoutMs})
  ) {
    return false;
  }

  return true;
}
