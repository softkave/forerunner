# forerunner

Softkave internal application runner & helpers - A CLI tool and SDK for managing certificates, MongoDB instances, and system hosts file.

## Overview

Forerunner is a command-line utility and Node.js SDK designed to streamline development and infrastructure management tasks. It provides tools for:

- **Certificate Management**: Generate Certificate Authorities (CAs) and signed certificates
- **MongoDB Management**: Download, configure, and run MongoDB instances with replica sets
- **Hosts File Management**: Manage `/etc/hosts` entries for local development

Forerunner can be used both as a CLI tool and as a programmatic SDK in your Node.js applications.

## Installation

### CLI Installation

```bash
npm install -g softkave-forerunner
# or
npx softkave-forerunner
```

### SDK Installation

```bash
npm install softkave-forerunner
```

## Usage

Forerunner can be used in two ways:

### CLI Usage

```bash
softkave-forerunner <command> [subcommand] [options]
```

### SDK Usage

```typescript
import {generateCA, runMongo} from 'softkave-forerunner';
// Use programmatically in your Node.js applications
```

## Commands

### Certificate Management (`certs`)

Generate and manage SSL/TLS certificates for development and infrastructure.

#### Generate Certificate Authority

```bash
softkave-forerunner certs ca -c <config-path> [options]
```

**Options:**

- `-c, --config <path>` - Path to CA configuration JSON file (required)
- `-f, --force` - Force regeneration even if CA already exists
- `-w, --cwd <path>` - Working directory
- `-s, --silent` - Silent mode

#### Generate Certificate

```bash
softkave-forerunner certs cert -c <config-path> [options]
```

**Options:**

- `-c, --config <path>` - Path to certificate configuration JSON file (required)
- `-f, --force` - Force regeneration even if certificate already exists
- `-w, --cwd <path>` - Working directory
- `-s, --silent` - Silent mode

### MongoDB Management (`mongo`)

Comprehensive MongoDB instance management with replica set support.

#### Download MongoDB

```bash
softkave-forerunner mongo download -c <config-path> [options]
```

#### Generate Certificates

```bash
softkave-forerunner mongo generate-certs -c <config-path> [options]
```

**Options:**

- `--overwriteConfig` - Overwrite existing config
- `--overwriteCA` - Overwrite existing CA
- `--overwriteCerts` - Overwrite existing certs

#### Generate Certificate Configurations

```bash
softkave-forerunner mongo generate-cert-configs -c <config-path> [options]
```

#### Generate MongoDB Configurations

```bash
softkave-forerunner mongo generate-configs -c <config-path> [options]
```

#### Start MongoDB Instances

```bash
softkave-forerunner mongo start -c <config-path> [options]
```

#### Stop MongoDB Instances

```bash
softkave-forerunner mongo stop -c <config-path> [options]
```

#### Setup Replica Set

```bash
softkave-forerunner mongo setup-replica-set -c <config-path> [options]
```

#### Setup MongoDB Users

```bash
softkave-forerunner mongo setup-users -c <config-path> [options]
```

#### Write MongoDB Users

```bash
softkave-forerunner mongo write-users -c <config-path> -u <users-path> [options]
```

**Options:**

- `-u, --users <path>` - Path to users JSON file (required)

#### Run MongoDB (Complete Setup)

```bash
softkave-forerunner mongo run -c <config-path> [options]
```

**Note:** This command is currently designed to run on a single computer. It sets up a complete MongoDB replica set locally.

**Automatic User Creation:** Admin and cluster admin users will be automatically created if they don't exist in your configuration. This ensures the replica set has the necessary administrative users for proper operation.

**Configuration Management:** An updated configuration file will be created in the working directory with the name `mongo-run-config.json`. This file contains the merged configuration used during the MongoDB setup process.

**Options:**

- `-e, --addToEtcHosts` - Add non-localhost hostnames to `/etc/hosts` file. This is useful when using non-localhost hostnames in your MongoDB configuration, as it ensures the replica set members can discover each other by resolving the hostnames back to the host machine (127.0.0.1)
- `--overwriteConfig` - Overwrite existing config
- `--overwriteCerts` - Overwrite existing certs

#### Setup etc/hosts for MongoDB

```bash
softkave-forerunner mongo etc-hosts -c <config-path> [options]
```

### Hosts File Management (`etc-hosts`)

Manage `/etc/hosts` file entries for local development.

#### Set Host Entry

```bash
softkave-forerunner etc-hosts set <hostname> [ip] [options]
```

**Arguments:**

- `hostname` - Hostname to set (required)
- `ip` - IP address (defaults to 127.0.0.1)

**Options:**

- `-f, --hosts-file <path>` - Path to hosts file (default: /etc/hosts)

#### Remove Host Entry

```bash
softkave-forerunner etc-hosts remove <hostname> [options]
```

#### List Host Entries

```bash
softkave-forerunner etc-hosts list [options]
```

#### Backup Hosts File

```bash
softkave-forerunner etc-hosts backup [options]
```

**Options:**

- `-b, --backup-file <path>` - Path to backup file (default: /etc/hosts.backup)

#### Restore Hosts File

```bash
softkave-forerunner etc-hosts restore [options]
```

## Common Options

Most commands support:

- `-s, --silent` - Silent mode (suppress output)
- `-h, --help` - Show help information

## Examples

### Certificate Management

```bash
# Generate a CA
softkave-forerunner certs ca -c ca-config.json

# Generate a certificate
softkave-forerunner certs cert -c cert-config.json
```

### MongoDB Management

```bash
# Complete MongoDB setup
softkave-forerunner mongo run -c mongo-config.json

# Download MongoDB only
softkave-forerunner mongo download -c mongo-config.json

# Start existing MongoDB instances
softkave-forerunner mongo start -c mongo-config.json
```

### Hosts File Management

```bash
# Set a host entry
softkave-forerunner etc-hosts set example.com 127.0.0.1

# List all host entries
softkave-forerunner etc-hosts list

# Backup hosts file
softkave-forerunner etc-hosts backup
```

## Configuration Files

### MongoDB Configuration

The MongoDB commands require a configuration file that specifies:

- MongoDB version and download settings
- Instance configurations
- Replica set settings
- User management settings

**Example MongoDB Configuration** (`src/mongo/examples/mongo-run-config.json`):

```json
{
  "workingDir": "./mongo-data",
  "mongoVersion": "7.0.0",
  "systemLinux": "ubuntu2004",
  "os": "linux",
  "caConfig": {
    "days": 365,
    "subject": {
      "C": "US",
      "ST": "Delaware",
      "L": "Dover",
      "O": "fimidara",
      "CN": "fimidara-mongo-ca"
    },
    "passphrase": "mongo-ca-passphrase"
  },
  "instancesHostnames": [
    "mongo-1.fimidara.local",
    "mongo-2.fimidara.local",
    "mongo-3.fimidara.local"
  ],
  "bindLocalhost": true,
  "instancePorts": [27017, 27018, 27019],
  "replicaCount": 3,
  "replicaSetName": "fimidara-rs",
  "users": [
    {
      "username": "admin",
      "password": "admin-password",
      "roles": [
        {
          "role": "root",
          "db": "admin"
        }
      ]
    },
    {
      "username": "app-user",
      "password": "app-password",
      "roles": [
        {
          "role": "readWrite",
          "db": "fimidara"
        }
      ]
    },
    {
      "username": "readonly-user",
      "password": "readonly-password",
      "roles": [
        {
          "role": "read",
          "db": "fimidara"
        }
      ]
    }
  ]
}
```

### Certificate Configuration

Certificate generation requires JSON configuration files specifying:

- CA settings (for CA generation)
- Certificate details (for certificate generation)
- File paths and naming conventions

**Example CA Configuration** (`src/certs/examples/ca-config.json`):

```json
{
  "outDir": "./certs",
  "days": 3650,
  "subject": {
    "C": "US",
    "ST": "Delaware",
    "L": "Dover",
    "O": "fimidara",
    "CN": "fimidara Root CA"
  },
  "files": {
    "key": "ca.key.pem",
    "cert": "ca.crt.pem",
    "csr": "ca.csr.pem",
    "chain": "ca-chain.pem"
  },
  "passphrase": "ca-passphrase"
}
```

**Example Certificate Configuration** (`src/certs/examples/cert-config.json`):

```json
{
  "outDir": "./certs",
  "days": 825,
  "subject": {
    "C": "US",
    "ST": "Delaware",
    "L": "Dover",
    "O": "fimidara",
    "CN": "fimidara.com"
  },
  "san": ["fimidara.com", "www.fimidara.com", "127.0.0.1"],
  "files": {
    "key": "fimidara.com.key.pem",
    "cert": "fimidara.com.crt.pem",
    "csr": "fimidara.com.csr.pem",
    "fullchain": "fimidara.com.fullchain.pem"
  },
  "ca": {
    "dir": "./certs/fimidara-root-ca",
    "passphrase": "ca-passphrase"
  },
  "passphrase": "cert-passphrase"
}
```

### Example Files

Complete example configuration files are available in the repository:

- **MongoDB**: [`src/mongo/examples/mongo-run-config.json`](src/mongo/examples/mongo-run-config.json)
- **CA**: [`src/certs/examples/ca-config.json`](src/certs/examples/ca-config.json)
- **Certificate**: [`src/certs/examples/cert-config.json`](src/certs/examples/cert-config.json)

## Error Handling

All commands include comprehensive error handling with:

- Detailed error messages
- Silent mode support for scripting
- Proper exit codes for automation
- Graceful failure handling

## SDK Usage

Forerunner can also be used as a Node.js SDK for programmatic access to all functionality.

### Installation

```bash
npm install softkave-forerunner
```

### Basic Usage

```typescript
import {
  generateCA,
  generateCert,
  runMongo,
  setHost,
  removeHost,
  ConsoleForeLogger,
} from 'softkave-forerunner';

const logger = new ConsoleForeLogger({silent: false});
```

### Certificate Management

#### Generate Certificate Authority

```typescript
import {generateCA, CAConfig} from 'softkave-forerunner';

const caConfig: CAConfig = {
  outDir: './certs/ca',
  days: 365,
  subject: {
    C: 'US',
    ST: 'California',
    L: 'San Francisco',
    O: 'My Company',
    CN: 'My CA',
  },
  files: {
    key: 'ca.key.pem',
    cert: 'ca.crt.pem',
    csr: 'ca.csr.pem',
    chain: 'ca-chain.pem',
  },
  passphrase: 'optional-passphrase',
};

await generateCA({
  opts: {
    config: './ca-config.json',
    force: false,
    cwd: process.cwd(),
    silent: false,
  },
  logger,
});
```

#### Generate Certificate

```typescript
import {generateCert, CertConfig} from 'softkave-forerunner';

const certConfig: CertConfig = {
  outDir: './certs/server',
  days: 365,
  subject: {
    C: 'US',
    ST: 'California',
    L: 'San Francisco',
    O: 'My Company',
    CN: 'server.example.com',
  },
  san: ['server.example.com', 'localhost', '127.0.0.1'],
  files: {
    key: 'server.key.pem',
    cert: 'server.crt.pem',
    csr: 'server.csr.pem',
    fullchain: 'server-fullchain.pem',
    crtAndKey: 'server.pem',
  },
  ca: {
    dir: './certs/ca',
    passphrase: 'optional-ca-passphrase',
  },
  passphrase: 'optional-passphrase',
};

await generateCert({
  opts: {
    config: './cert-config.json',
    force: false,
    cwd: process.cwd(),
    silent: false,
  },
  logger,
});
```

### MongoDB Management

#### Complete MongoDB Setup

```typescript
import {runMongo, MongoRunConfig} from 'softkave-forerunner';

const mongoConfig: MongoRunConfig = {
  workingDir: './mongo-setup',
  mongoVersion: '7.0.0',
  systemLinux: 'ubuntu2004',
  os: 'linux',
  caConfig: {
    days: 365,
    subject: {
      C: 'US',
      ST: 'California',
      L: 'San Francisco',
      O: 'My Company',
      CN: 'MongoDB CA',
    },
    passphrase: 'optional-passphrase',
  },
  instancesHostnames: ['mongo1.local', 'mongo2.local', 'mongo3.local'],
  bindLocalhost: true,
  instancePorts: [27017, 27018, 27019],
  replicaCount: 3,
  replicaSetName: 'rs0',
  users: [
    {
      username: 'admin',
      password: 'admin123',
      roles: [
        'userAdminAnyDatabase',
        'dbAdminAnyDatabase',
        'readWriteAnyDatabase',
      ],
    },
  ],
};

await runMongo({
  mongoRunConfig: mongoConfig,
  overwriteConfig: false,
  overwriteCerts: false,
  addToEtcHosts: true,
  logger,
});
```

#### Individual MongoDB Operations

```typescript
import {
  downloadMongo,
  generateMongoCertsMain,
  startMongodInstancesMain,
  stopMongodInstancesMain,
  setupReplicaSetMain,
} from 'softkave-forerunner';

// Download MongoDB
await downloadMongo({mongoRunConfig, logger});

// Generate certificates
await generateMongoCertsMain({
  mongoRunConfig,
  overwriteConfig: false,
  overwriteCA: false,
  overwriteCerts: false,
  logger,
});

// Start instances
await startMongodInstancesMain({mongoRunConfig, logger});

// Setup replica set
await setupReplicaSetMain({mongoRunConfig, logger});

// Stop instances
await stopMongodInstancesMain({mongoRunConfig, logger});
```

### Hosts File Management

```typescript
import {
  setHost,
  removeHost,
  listHosts,
  backupHostsFile,
  restoreHostsFile,
  HostEntry,
} from 'softkave-forerunner';

// Set a host entry
setHost({
  hostname: 'example.com',
  ip: '127.0.0.1',
  hostsFilePath: '/etc/hosts',
  logger,
});

// Remove a host entry
removeHost({
  hostname: 'example.com',
  hostsFilePath: '/etc/hosts',
  logger,
});

// List all host entries
const entries: HostEntry[] = listHosts({
  hostsFilePath: '/etc/hosts',
  logger,
});

// Backup hosts file
backupHostsFile({
  hostsFilePath: '/etc/hosts',
  backupFilePath: '/etc/hosts.backup',
  logger,
});

// Restore hosts file
restoreHostsFile({
  hostsFilePath: '/etc/hosts',
  backupFilePath: '/etc/hosts.backup',
  logger,
});
```

### Process Management

```typescript
import {startProcess, IInstanceOpts} from 'softkave-forerunner';

const instance: IInstanceOpts = {
  name: 'my-service',
  runName: 'my-service-run',
  startCmdFilepath: './start-script.sh',
  logsFolderpath: './logs',
  cwd: process.cwd(),
  env: {NODE_ENV: 'development'},
  pidsFilepath: './pids.json',
};

const result = await startProcess(instance);
console.log('Process started:', result.pid);
```

### PID Management

```typescript
import {writePIDs, getPIDs, endPIDs, IProcessIdItem} from 'softkave-forerunner';

// Write PIDs to file
const pids: IProcessIdItem[] = [
  {name: 'service1', pid: '1234'},
  {name: 'service2', pid: '5678'},
];

await writePIDs(pids, {pidsFilepath: './pids.json'});

// Read PIDs from file
const existingPids = await getPIDs({pidsFilepath: './pids.json'});

// End processes by PIDs
await endPIDs(pids, {pidsFilepath: './pids.json'});
```

### Logging

```typescript
import {ConsoleForeLogger, IForeLogger} from 'softkave-forerunner';

// Create logger instance
const logger = new ConsoleForeLogger({silent: false});

// Use logger
logger.log('Info message');
logger.error('Error message');
logger.table([{name: 'John', age: 30}]);

// Custom logger implementation
class CustomLogger implements IForeLogger {
  log(message: unknown, ...args: unknown[]): void {
    console.log('[LOG]', message, ...args);
  }

  error(message: unknown, ...args: unknown[]): void {
    console.error('[ERROR]', message, ...args);
  }

  table(tabularData: unknown, properties?: readonly string[]): void {
    console.table(tabularData, properties);
  }

  onSilentFail(message: unknown): void {
    // Handle silent failures
  }
}
```

### Type Definitions

The SDK exports comprehensive TypeScript types:

- `CAConfig` - Certificate Authority configuration
- `CertConfig` - Certificate configuration
- `MongoRunConfig` - MongoDB run configuration
- `HostEntry` - Host file entry structure
- `IProcessIdItem` - Process ID item structure
- `IForeLogger` - Logger interface
- `IInstanceOpts` - Process instance options

### Error Handling

All SDK functions include proper error handling and can be used with try-catch blocks:

```typescript
try {
  await runMongo({mongoRunConfig, logger});
} catch (error) {
  console.error('MongoDB setup failed:', error);
  process.exit(1);
}
```

## Help

For detailed help on any command:

```bash
softkave-forerunner <command> --help
softkave-forerunner <command> <subcommand> --help
```
