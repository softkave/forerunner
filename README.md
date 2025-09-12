# softkave-forerunner

Softkave's internal application runner & helpers - A CLI tool and SDK for managing certificates, MongoDB instances, and system hosts file.

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
import {generateCA, initMongo} from 'softkave-forerunner';
// Use programmatically in your Node.js applications
```

## Commands

### Command Overview

#### Certificate Management

- [`certs ca`](#generate-certificate-authority) - Generate Certificate Authority
- [`certs cert`](#generate-certificate) - Generate signed certificate

#### MongoDB Management

- [`mongo download`](#download-mongodb) - Download MongoDB binary
- [`mongo generate-certs`](#generate-certificates) - Generate MongoDB certificates
- [`mongo generate-cert-configs`](#generate-certificate-configurations) - Generate certificate configs
- [`mongo generate-configs`](#generate-mongodb-configurations) - Generate MongoDB configs
- [`mongo start`](#start-mongodb-instances) - Start MongoDB instances
- [`mongo stop`](#stop-mongodb-instances) - Stop MongoDB instances
- [`mongo setup-replica-set`](#setup-replica-set) - Setup replica set
- [`mongo setup-users`](#setup-mongodb-users) - Setup MongoDB users
- [`mongo write-users`](#write-mongodb-users) - Write users to file
- [`mongo init`](#initialize-mongodb-complete-setup) - Complete MongoDB setup
- [`mongo etc-hosts`](#setup-etchosts-for-mongodb) - Setup etc/hosts for MongoDB

#### Hosts File Management

- [`etc-hosts set`](#set-host-entry) - Set host entry
- [`etc-hosts remove`](#remove-host-entry) - Remove host entry
- [`etc-hosts list`](#list-host-entries) - List host entries
- [`etc-hosts backup`](#backup-hosts-file) - Backup hosts file
- [`etc-hosts restore`](#restore-hosts-file) - Restore hosts file

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

**Description**: Configures a MongoDB replica set by connecting directly to the first instance in the configuration. This command initializes the replica set and adds all configured instances as members.

**Connection Method**: Uses a direct connection to the first instance (typically the primary) to configure the replica set.

**Important:** If you are using non-IP hostnames (e.g., `mongo-1.fimidara.local`) in your MongoDB configuration, you must add these hostnames to your `/etc/hosts` file (on Mac/Linux or equivalent on other Operating Systems) before running this command, if they are not discoverable through DNS. Use the `etc-hosts` command to manage host entries.

#### Setup MongoDB Users

```bash
softkave-forerunner mongo setup-users -c <config-path> [options]
```

**Description**: Creates and adds users directly to the MongoDB database. This command connects to MongoDB and creates user accounts with the specified roles and permissions.

**Prerequisites**: Expects a replica set to be running and connects to the replica set using the configuration provided.

**What it does**:

- Connects to the MongoDB replica set
- Creates user accounts in the database
- Assigns roles and permissions to users
- Users are immediately available for authentication

#### Write MongoDB Users

```bash
softkave-forerunner mongo write-users -c <config-path> [options]
```

**Description**: Writes user configuration from the MongoDB config (and/or `--users` path provided) to a `mongo-users.json` file in the working directory. This command extracts user information from the configuration and saves it to a separate file for reference or backup purposes.

**What it does**:

- Reads user configuration from the MongoDB config file (and/or `--users` path provided)
- Writes user data to `mongo-users.json` in the working directory
- Does not connect to or modify the MongoDB database

**Options:**

- `-u, --users <path>` - Path to users JSON file (optional - if not provided, users are read from mongo config)
- `--create-admin` - Create admin user if not found (default: false)
- `--create-cluster-admin` - Create cluster admin user if not found (default: false)

#### Initialize MongoDB (Complete Setup)

```bash
softkave-forerunner mongo init -c <config-path> [options]
```

**Note:** This command is currently designed to run on a single computer. It sets up a complete MongoDB replica set locally. **This command should be run once** to set up the initial MongoDB infrastructure. After the initial setup, use other commands like `start` and `stop`, for ongoing operations.

**Important:** If you are using non-IP hostnames (e.g., `mongo-1.fimidara.local`) in your MongoDB configuration, you must add these hostnames to your `/etc/hosts` file before running this command. Use the `etc-hosts` command to manage host entries.

**Automatic User Creation:** Admin and cluster admin users will be automatically created if they don't exist in your configuration. This ensures the replica set has the necessary administrative users for proper operation. Users are written to `mongo-users.json` in the working directory from the configuration.

**Configuration Management:** An updated configuration file will be created in the working directory with the name `mongo-run-config.json`. This file contains the merged configuration used during the MongoDB setup process.

**Options:**

- `--overwriteConfig` - Overwrite existing config
- `--overwriteCerts` - Overwrite existing certs

#### Setup etc/hosts for MongoDB

```bash
softkave-forerunner mongo etc-hosts -c <config-path> [options]
```

**Description**: Adds non-IP hostnames from the MongoDB configuration to the `/etc/hosts` file. This command extracts hostnames from the `instancesHostnames` configuration and maps them to the local IPv4 address or 127.0.0.1 in the system hosts file.

**What it does**:

- Reads `instancesHostnames` from the MongoDB configuration
- Identifies non-IP hostnames (e.g., `mongo-1.fimidara.local`)
- Adds hostname-to-IP mappings to `/etc/hosts` file
- Maps hostnames to the local IPv4 address or 127.0.0.1 for local development

**Important**: This is a convenience command that should only be run if the hostnames are not discoverable through DNS. The command maps all hostnames in the configuration without checking whether they are already discoverable through DNS or not.

**Platform Support**: This command only works on Mac/Linux systems. On other operating systems, you'll need to manually manage host entries using the system's equivalent functionality.

### Hosts File Management (`etc-hosts`)

Manage `/etc/hosts` file entries for local development.

**Platform Support:** These commands only work on Mac/Linux systems. On other operating systems, you'll need to manually manage host entries using the system's equivalent functionality.

**Note:** Commands that write to the `/etc/hosts` file (set, backup, restore) will require sudo password unless you have configured passwordless sudo access for `/etc/hosts` in your sudoers file.

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
softkave-forerunner mongo init -c mongo-config.json

# Download MongoDB only
softkave-forerunner mongo download -c mongo-config.json

# Start existing MongoDB instances
softkave-forerunner mongo start -c mongo-config.json

# Write users from config only
softkave-forerunner mongo write-users -c mongo-config.json

# Write users from config with admin users
softkave-forerunner mongo write-users -c mongo-config.json --create-admin --create-cluster-admin

# Write users from file and config
softkave-forerunner mongo write-users -c mongo-config.json -u users.json
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

The MongoDB commands require a configuration file that specifies MongoDB version, instance settings, replica set configuration, and user management. Below is a detailed breakdown of each configuration option:

#### Configuration Options

**`workingDir`** (string, required)

- **Description**: The directory where MongoDB data, logs, and configuration files will be stored
- **Example**: `"./fimidara-mongo"`
- **Note**: This directory will be created if it doesn't exist

**`mongoVersion`** (string, optional)

- **Description**: The MongoDB version to download and use
- **Example**: `"8.0.0"`
- **Default**: Uses the latest stable version if not specified

**`systemLinux`** (string, optional if `os` is not `linux`)

- **Description**: The Linux distribution identifier for MongoDB download
- **Example**: `"ubuntu2004"`
- **Options**: `"ubuntu2004"`, `"ubuntu2204"`, `"rhel8"`, `"rhel9"`, etc.

**`os`** (string, optional)

- **Description**: The operating system platform
- **Example**: `"linux"`
- **Options**: `"linux"`, `"macos"`, `"windows"`

**`caConfig`** (object, required)

- **Description**: Certificate Authority configuration for MongoDB SSL/TLS certificates
- **Properties**:
  - `days` (number): Certificate validity period in days
  - `subject` (object): X.509 certificate subject information
    - `C` (string): Country code (2 characters)
    - `ST` (string): State or province
    - `L` (string): Locality or city
    - `O` (string): Organization name
    - `CN` (string): Common name for the CA
  - `passphrase` (string, optional): Passphrase for the CA private key

**`instancesHostnames`** (array, required)

- **Description**: Hostnames for each MongoDB instance in the replica set
- **Example**: `["mongo-1.fimidara.local", "mongo-2.fimidara.local", "mongo-3.fimidara.local", "0.0.0.0", "localhost", "127.0.0.1"]`
- **Note**: Must match the number of instances specified in `replicaCount`

**`bindLocalhost`** (boolean, optional)

- **Description**: Whether to bind MongoDB instances to localhost (`127.0.0.1`)
- **Example**: `true`
- **Default**: `false`

**`instancePorts`** (array, required)

- **Description**: Port numbers for each MongoDB instance
- **Example**: `[27017, 27018, 27019]`
- **Note**: Must match the number of instances and be unique ports

**`replicaCount`** (number, required)

- **Description**: Number of MongoDB instances in the replica set
- **Example**: `3`
- **Minimum**: 3 (required for replica set functionality)

**`replicaSetName`** (string, required)

- **Description**: Name of the MongoDB replica set
- **Example**: `"fimidara-rs"`
- **Note**: All instances in the replica set must use the same name

**`users`** (array, required)

- **Description**: MongoDB users to create with their roles and permissions
- **Properties**:
  - `username` (string): User login name
  - `password` (string): User password
  - `authDb` (string, optional): Authentication database for the user (default: "`admin`")
  - `roles` (array): Array of role objects
    - `role` (string): MongoDB role name (see supported roles below)
    - `db` (string): Database name the role applies to

**Supported Roles:**

- `userAdminAnyDatabase`: User administration privileges for all databases (use with "admin" db)
- `clusterAdmin`: Cluster administration privileges (use with "admin" db)
- `readWrite`: Read and write privileges for a specific database
- `read`: Read-only privileges for a specific database

**Example MongoDB Configuration** (`src/mongo/examples/mongo-run-config.json`):

```json
{
  "workingDir": "./mongo-data",
  "mongoVersion": "8.0.0",
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
      "authDb": "admin",
      "roles": [
        {
          "role": "userAdminAnyDatabase",
          "db": "admin"
        }
      ]
    },
    {
      "username": "cluster-admin",
      "password": "cluster-admin-password",
      "authDb": "admin",
      "roles": [
        {
          "role": "clusterAdmin",
          "db": "admin"
        }
      ]
    },
    {
      "username": "app-user",
      "password": "app-password",
      "authDb": "fimidara",
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
      "authDb": "fimidara",
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

Certificate generation requires JSON configuration files for both Certificate Authority (CA) and end-entity certificates. Below are detailed explanations for each configuration option:

#### CA Configuration Options

**`outDir`** (string, required)

- **Description**: Output directory where CA files will be generated
- **Example**: `"./certs"`
- **Note**: Directory will be created if it doesn't exist

**`days`** (number, required)

- **Description**: Certificate validity period in days
- **Example**: `3650` (10 years)
- **Note**: Must be a positive integer

**`subject`** (object, required)

- **Description**: X.509 certificate subject information for the CA
- **Properties**:
  - `C` (string): Country code (2 characters, e.g., "US")
  - `ST` (string): State or province name
  - `L` (string): Locality or city name
  - `O` (string): Organization name
  - `CN` (string): Common name for the CA

**`files`** (object, optional)

- **Description**: Custom filenames for generated CA files
- **Properties**:
  - `key` (string): Private key filename (default: "ca.key.pem")
  - `cert` (string): Certificate filename (default: "ca.crt.pem")
  - `csr` (string): Certificate Signing Request filename (default: "ca.csr.pem")
  - `chain` (string): Certificate chain filename (default: "ca-chain.pem")
- **Default**: Uses standard filenames if not specified

**`passphrase`** (string, optional)

- **Description**: Passphrase to protect the CA private key
- **Example**: `"ca-passphrase"`
- **Note**: If provided, the private key will be encrypted

#### Certificate Configuration Options

**`outDir`** (string, required)

- **Description**: Output directory where certificate files will be generated
- **Example**: `"./certs"`
- **Note**: Directory will be created if it doesn't exist

**`days`** (number, required)

- **Description**: Certificate validity period in days
- **Example**: `825` (approximately 2.25 years)
- **Note**: Must be a positive integer

**`subject`** (object, required)

- **Description**: X.509 certificate subject information for the end-entity certificate
- **Properties**:
  - `C` (string): Country code (2 characters, e.g., "US")
  - `ST` (string): State or province name
  - `L` (string): Locality or city name
  - `O` (string): Organization name
  - `CN` (string): Common name (typically the primary domain name)

**`san`** (array, required)

- **Description**: Subject Alternative Names (SAN) for the certificate
- **Example**: `["fimidara.com", "www.fimidara.com", "127.0.0.1"]`
- **Note**: Must include at least one SAN entry

**`files`** (object, required)

- **Description**: Filenames for generated certificate files
- **Properties**:
  - `key` (string): Private key filename
  - `cert` (string): Certificate filename
  - `csr` (string): Certificate Signing Request filename
  - `fullchain` (string): Full certificate chain filename (cert + CA chain)
  - `crtAndKey` (string, optional): Combined certificate and key filename

**`ca`** (object, required)

- **Description**: Certificate Authority configuration for signing
- **Properties**:
  - `dir` (string): Directory containing the CA files
  - `passphrase` (string, optional): CA private key passphrase

**`passphrase`** (string, optional)

- **Description**: Passphrase to protect the certificate private key
- **Example**: `"cert-passphrase"`
- **Note**: If provided, the private key will be encrypted

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
import {initMongo, MongoRunConfig} from 'softkave-forerunner';

const mongoConfig: MongoRunConfig = {
  workingDir: './mongo-setup',
  mongoVersion: '8.0.0',
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
      authDb: 'admin',
      roles: [
        {
          role: 'userAdminAnyDatabase',
          db: 'admin',
        },
      ],
    },
    {
      username: 'app-user',
      password: 'app123',
      authDb: 'myapp',
      roles: [
        {
          role: 'readWrite',
          db: 'myapp',
        },
      ],
    },
  ],
};

await initMongo({
  mongoRunConfig: mongoConfig,
  overwriteConfig: false,
  overwriteCerts: false,
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

**Important Notes:**

- `startProcess` starts a background process that continues running even after the terminal or the initial program that started it stops
- Background processes can be stopped by sending a kill signal to the process ID from the PID filepath provided or using `stopProcess`
- Process management functions have only been tested on Mac and Linux systems

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
  await initMongo({mongoRunConfig, logger});
} catch (error) {
  console.error('MongoDB setup failed:', error);
  process.exit(1);
}
```

## Release Notes

For detailed information about changes, new features, and bug fixes in each version:

- **[v0 Series Release Notes](notes/releases/v0.md)** - Complete changelog for v0.x.x versions

## Help

For detailed help on any command:

```bash
softkave-forerunner <command> --help
softkave-forerunner <command> <subcommand> --help
```
