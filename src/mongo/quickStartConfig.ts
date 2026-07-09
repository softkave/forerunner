import path from 'path';
import {
  InstanceHostnameEntry,
  MongoRunConfig,
  mongoRunConfigSchema,
} from './mongoRunConfig.js';
import {generateMongoPassword} from './utils.js';

export function getDefaultMongoDockerNetworkName(
  containerName: string
): string {
  return `${containerName}-net`;
}

export function getQuickStartContainerHostname(
  containerName: string,
  instanceNumber: number
): string {
  return `${containerName}-mongod-${instanceNumber}`;
}

/** Default quick-start hostname suffix (RFC 2606 `.test`; avoids macOS mDNS on `.local`). */
export const DEFAULT_QUICK_START_HOSTNAME_SUFFIX = '.mongo.test';

/** Stable quick-start hostname derived from container name (deterministic). */
export function getDefaultDevHostname(
  containerName: string,
  instanceNumber: number
): string {
  return `${getQuickStartContainerHostname(
    containerName,
    instanceNumber
  )}${DEFAULT_QUICK_START_HOSTNAME_SUFFIX}`;
}

function buildDefaultHostnames(
  containerName: string,
  instanceCount: number,
  customHostnames?: string[]
): InstanceHostnameEntry[] {
  if (customHostnames && customHostnames.length > 0) {
    if (customHostnames.length !== instanceCount) {
      throw new Error(
        `Expected ${instanceCount} hostnames (one per instance), got ${customHostnames.length}`
      );
    }
    return customHostnames.map(hostname => [
      {hostname, resolution: 'local' as const},
      'localhost',
    ]);
  }

  return Array.from({length: instanceCount}, (_, index) => {
    const hostname = getDefaultDevHostname(containerName, index + 1);
    return [{hostname, resolution: 'local' as const}, 'localhost'];
  });
}

export function buildQuickMongoRunConfig(params: {
  containerName: string;
  ports: number[];
  workingDir?: string;
  replicaSetName?: string;
  mongoVersion?: string;
  dockerNetwork?: string;
  hostnames?: string[];
  etcHostsSetup?: MongoRunConfig['etcHostsSetup'];
  etcHostsIp?: string;
  user?: string;
  password?: string;
}): MongoRunConfig {
  const {
    containerName,
    ports,
    workingDir = path.join(process.cwd(), '.forerunner-mongo', containerName),
    replicaSetName = `${containerName}-rs`,
    mongoVersion,
    dockerNetwork = getDefaultMongoDockerNetworkName(containerName),
    hostnames,
    etcHostsSetup,
    etcHostsIp,
    user,
    password,
  } = params;

  if (ports.length < 3) {
    throw new Error('At least 3 ports are required for a MongoDB replica set');
  }

  const authEnabled = Boolean(user) && Boolean(password);

  const config: MongoRunConfig = {
    workingDir,
    containerName,
    dockerNetwork,
    mongoVersion,
    replicaSetName,
    ports,
    hostnames: buildDefaultHostnames(containerName, ports.length, hostnames),
    etcHostsSetup,
    etcHostsIp,
    authorization: authEnabled ? 'enabled' : 'disabled',
    caConfig: {
      days: 3650,
      subject: {
        C: 'US',
        ST: 'Delaware',
        L: 'Dover',
        O: `${containerName} org`,
        CN: `${containerName} CA`,
      },
      // Empty passphrase keeps cert generation non-interactive for CLI quick
      // start.
      passphrase: '',
    },
    users: authEnabled
      ? [
          {
            username: user!,
            password: password!,
            roles: [
              {role: 'userAdminAnyDatabase', db: 'admin'},
              {role: 'readWriteAnyDatabase', db: 'admin'},
              {role: 'clusterAdmin', db: 'admin'},
            ],
          },
        ]
      : [],
  };

  return mongoRunConfigSchema.parse(config);
}

export function buildQuickMongoStopConfig(params: {
  containerName: string;
  ports: number[];
  workingDir?: string;
  dockerNetwork?: string;
  hostnames?: string[];
}): MongoRunConfig {
  const {
    containerName,
    ports,
    workingDir = path.join(process.cwd(), '.forerunner-mongo', containerName),
    dockerNetwork = getDefaultMongoDockerNetworkName(containerName),
    hostnames,
  } = params;

  if (ports.length < 3) {
    throw new Error('At least 3 ports are required');
  }

  return mongoRunConfigSchema.parse({
    workingDir,
    containerName,
    dockerNetwork,
    replicaSetName: `${containerName}-rs`,
    ports,
    hostnames: buildDefaultHostnames(containerName, ports.length, hostnames),
    authorization: 'disabled',
    caConfig: {
      days: 3650,
      subject: {
        C: 'US',
        ST: 'Delaware',
        L: 'Dover',
        O: `${containerName} org`,
        CN: `${containerName} CA`,
      },
      // Empty passphrase keeps cert generation non-interactive for CLI quick start.
      passphrase: '',
    },
    users: [],
  });
}

/** Parse CLI port arguments into numbers. */
export function parseMongoCliPorts(ports: string[]): number[] {
  if (ports.length < 3) {
    throw new Error('At least 3 ports are required');
  }
  return ports.map(port => {
    const parsed = parseInt(port, 10);
    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid port: ${port}`);
    }
    return parsed;
  });
}

export function generateQuickStartPassword(): string {
  return generateMongoPassword();
}
