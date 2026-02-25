# softkave-forerunner

Application runner & helpers - A CLI tool and SDK for managing certificates, MongoDB instances, system hosts file, etc.

## Overview

Forerunner is a command-line utility and Node.js SDK designed to streamline development and infrastructure management tasks. It provides tools for:

- **Certificate Management**: Generate Certificate Authorities (CAs) and signed certificates
- **MongoDB Management**: Download, configure, and run MongoDB instances with replica sets
- **Hosts File Management**: Manage `/etc/hosts` entries for local development
- **Process Management**: Find, start, and end processes

## Installation

### CLI Installation

```bash
npm install softkave-forerunner
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

- [`mongo scaffold-config`](#scaffold-mongodb-configuration) - Generate MongoDB configuration file
- [`mongo validate-config`](#validate-mongodb-configuration) - Validate MongoDB configuration file
- [`mongo setup-replica-set`](#setup-replica-set-deprecated) - Setup replica set (deprecated: use "start --setup-users")
- [`mongo generate-certs`](#generate-certificates) - Generate MongoDB certificate configs and certificates
- [`mongo start`](#start-mongodb-instances) - Start MongoDB instances (generates certs if not present)
- [`mongo stop`](#stop-mongodb-instances) - Stop MongoDB instances
- [`mongo setup-users`](#setup-mongodb-users) - Setup MongoDB users
- [`mongo print-uri`](#print-mongodb-uri) - Print MongoDB connection URI
- [`mongo replica-set-status`](#print-replica-set-status) - Print replica set status
- [`mongo restart`](#restart-mongodb-rolling-restart) - Rolling restart of replica set members

#### PostgreSQL Management

- [`postgres scaffold-config`](#scaffold-configuration) - Generate PostgreSQL configuration file
- [`postgres validate-config`](#validate-postgresql-configuration) - Validate PostgreSQL configuration file
- [`postgres generate-certs`](#generate-certificates) - Generate PostgreSQL certificates
- [`postgres start`](#start-postgresql-instance) - Start PostgreSQL instance
- [`postgres stop`](#stop-postgresql-instance) - Stop PostgreSQL instance
- [`postgres setup-users`](#setup-postgresql-users) - Setup PostgreSQL users
- [`postgres setup-dbs`](#setup-postgresql-databases) - Setup PostgreSQL databases

#### Hosts File Management

- [`etc-hosts set`](#set-host-entry) - Set host entry
- [`etc-hosts remove`](#remove-host-entry) - Remove host entry
- [`etc-hosts list`](#list-host-entries) - List host entries
- [`etc-hosts backup`](#backup-hosts-file) - Backup hosts file
- [`etc-hosts restore`](#restore-hosts-file) - Restore hosts file

#### Process Management

- [`pm children-pids`](#find-children-pids) - Find all child PIDs of a parent PID

#### Run env

- [`run-env`](#run-with-selected-env-file) - Run a command with a selected `.env*` file

#### Security

- [`security password`](#generate-password) - Generate production-grade password(s)
- [`security jwt-secret`](#generate-jwt-secret) - Generate production-grade JWT secret(s)

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

MongoDB replica set management. **Only replica sets are supported**; standalone (single-node) instances are not supported.

**Docker is required** for mongo operations (start, stop, setup-replica-set, restart, etc.); instances run as Docker containers.

**When authorization is enabled:** An admin user (with `userAdminAnyDatabase`) is required in config for user management. A cluster admin user (with `clusterAdmin`) is necessary for replica set and other operations after initial setup (e.g. restart, status, reconfig).

#### Scaffold MongoDB Configuration

```bash
softkave-forerunner mongo scaffold-config [options]
```

**Description**: Generates a MongoDB configuration file interactively or using default values. This command prompts for all necessary configuration options including working directory, MongoDB version, SSL/TLS certificate authority configuration (SSL is always enabled), replica set configuration, instance ports and hostnames, and user authentication settings.

**Options:**

- `--defaults` - Use default values instead of prompting (default: false)
- `-o, --output <path>` - Output file path (default: `./mongo-run-config.json`)
- `-s, --silent` - Silent mode

**Example:**

```bash
# Interactive mode (prompts for all values)
softkave-forerunner mongo scaffold-config

# Use defaults and save to custom location
softkave-forerunner mongo scaffold-config --defaults -o ./configs/mongo-config.json
```

#### Validate MongoDB Configuration

```bash
softkave-forerunner mongo validate-config -c <config-path> [options]
```

**Description**: Validates the MongoDB configuration file. Checks that the file is valid JSON and that the content conforms to the run config schema. Prints clear validation errors to the console (e.g. missing required fields, invalid values, user/database constraints).

**Options:**

- `-c, --config <path>` - Path to mongo run config file (required)
- `-s, --silent` - Silent mode

#### Setup Replica Set (Deprecated)

```bash
softkave-forerunner mongo setup-replica-set -c <config-path> [options]
```

**Description**: **Deprecated**: This command is kept for backwards compatibility but is equivalent to `mongo start --setup-users`. Use `mongo start --setup-users` instead.

This command starts MongoDB instances, sets up the replica set, and sets up users. It does the same as `mongo start --setup-users`.

**Options:** `-c, --config <path>` (required), `-s, --silent`

#### Generate Certificates

```bash
softkave-forerunner mongo generate-certs -c <config-path> [options]
```

**Description**: Generates MongoDB certificate configurations and certificates (CA and instance certs). This command combines both certificate config generation and certificate generation into a single command.

**Options:**

- `-c, --config <path>` - Path to mongo run config file (required)
- `--overwriteConfig` - Overwrite existing config (default: false)
- `--overwriteCA` - Overwrite existing CA (default: false)
- `--overwriteCerts` - Overwrite existing certs (default: false)
- `-s, --silent` - Silent mode

**Note**: If `overwriteCA` is true, certificates are also overwritten (because certificates signed by the old CA are no longer valid).

#### Start MongoDB Instances

```bash
softkave-forerunner mongo start -c <config-path> [options]
```

**Description**: Starts MongoDB instances and sets up the replica set (if not already setup). **If not already present**, this command will automatically generate certificate configs and certificates before starting instances. SSL/TLS is always enabled. The replica set is initialized automatically if it hasn't been initialized yet. Use `--setup-users` to also setup users after starting.

**Options:**

- `-c, --config <path>` - Path to mongo run config file (required)
- `--no-setup-replica-set` - Skip replica set setup (default: replica set is setup automatically)
- `--setup-users` - Setup MongoDB users after starting instances (default: false)
- `-s, --silent` - Silent mode

#### Stop MongoDB Instances

```bash
softkave-forerunner mongo stop -c <config-path> [options]
```

**Options:**

- `-c, --config <path>` - Path to mongo run config file (required)
- `-s, --silent` - Silent mode

#### Setup MongoDB Users

```bash
softkave-forerunner mongo setup-users -c <config-path> [options]
```

**Description**: Creates and syncs users with the MongoDB database. It authenticates using the first admin user in config (which is setup when setting up the replica set), then creates or updates all other users from config. On subsequent runs, it applies changes made in config: adds new users, updates roles (grant/revoke) and password for existing users, and removes users no longer in config (except it will not remove the sole admin if there is no other admin in config).

**Prerequisites**: Expects a replica set to be running and connects to the replica set using the configuration provided.

**Options:** `-c, --config <path>` (required), `-s, --silent`

#### Print Replica Set Status

```bash
softkave-forerunner mongo replica-set-status -c <config-path> [options]
```

**Description**: Displays the current status of the MongoDB replica set, including member information, health status, and connection details. This command connects to the replica set and retrieves real-time status information using MongoDB's `replSetGetStatus` command.

**Example Output**:

```
Replica Set Status:
Set: fimidara-rs
Date: 2024-01-15T10:30:00.000Z
My State: 1
Members:
  - Hostname: mongo-1.fimidara.local:27017
    Status: PRIMARY
    Health: 1
    Last Heartbeat: 2024-01-15T10:29:58.000Z
  - Hostname: mongo-2.fimidara.local:27018
    Status: SECONDARY
    Health: 1
    Last Heartbeat: 2024-01-15T10:29:58.000Z
  - Hostname: mongo-3.fimidara.local:27019
    Status: SECONDARY
    Health: 1
    Last Heartbeat: 2024-01-15T10:29:58.000Z
```

**Options**:

- `-c, --config <path>` - Path to mongo run config file (required)
- `--prefer-localhost` - Prefer localhost over other hostnames when connecting (default: false)
- `--ping <ping>` - Ping option: `all`, `repl`, or instance number (default: "all")
- `-s, --silent` - Silent mode

#### Print MongoDB URI

```bash
softkave-forerunner mongo print-uri -c <config-path> [options]
```

**Description**: Prints the MongoDB connection URI for the given config (replica set or single instance).

**Options**:

- `-c, --config <path>` - Path to mongo run config file (required)
- `--connection-type <type>` - `instance` or `replicaSet` (default: "replicaSet")
- `--instance-number <number>` - Instance number for instance connection type (default: "1")
- `-u, --username <username>` - Username for authentication
- `-p, --password <password>` - Password for authentication
- `--prefer-localhost` - Prefer localhost over other hostnames (default: false)
- `--server-selection-timeout <ms>` - Server selection timeout in milliseconds (default: "5000")
- `-s, --silent` - Silent mode

#### Restart MongoDB (Rolling Restart)

```bash
softkave-forerunner mongo restart -c <config-path> [options]
```

**Description**: Performs a **rolling restart** of the replica set members. A rolling restart restarts one member at a time (typically stepping down the primary first so a secondary becomes primary, then restarting the old primary, then secondaries), so the replica set stays available and no election is required for normal operation. This avoids downtime and keeps the majority of nodes up at all times.

**Use cases**:

- **Upgrade MongoDB version**: After updating the `mongoVersion` in config, run `restart` so each member comes back with the new version.
- **Apply configuration changes**: After upgrading forerunner to pick up how it manages MongoDB (e.g. changes to generated `mongod` config), run `restart` so running instances pick up the new configuration.

**Options**:

- `-c, --config <path>` - Path to mongo run config file (required)
- `--force` - Force stop MongoDB instances (default: false)
- `-s, --silent` - Silent mode

### PostgreSQL Management (`postgres`)

PostgreSQL instance management via Docker. Supports single PostgreSQL instances with configurable authentication, SSL, users, and databases.

**Docker is required** for postgres operations (start, stop, setup-users, setup-dbs); instances run as Docker containers.

**Discoverability**: By default, instances use `discoverability: "local"` (bind `127.0.0.1:port`, reachable only from this host). Set `discoverability: "global"` to bind to all interfaces (container discoverable globally).

#### Scaffold Configuration

```bash
softkave-forerunner postgres scaffold-config [options]
```

**Description**: Generates a PostgreSQL configuration file interactively or with default values.

**Options**:

- `--defaults` - Use default values instead of prompting (default: false)
- `-o, --output <path>` - Output file path (default: "./postgres-run-config.json")
- `-s, --silent` - Silent mode

#### Validate PostgreSQL Configuration

```bash
softkave-forerunner postgres validate-config -c <config-path> [options]
```

**Description**: Validates the PostgreSQL configuration file. Checks that the file is valid JSON and that the content conforms to the run config schema. Prints clear validation errors to the console (e.g. missing required fields, authorization/SSL constraints, user database references).

**Options:**

- `-c, --config <path>` - Path to postgres run config file (required)
- `-s, --silent` - Silent mode

#### Generate Certificates

```bash
softkave-forerunner postgres generate-certs -c <config-path> [options]
```

**Description**: Generates SSL/TLS certificates for PostgreSQL. Creates certificate configuration files, CA, and server certificate. Certificates are generated in `workingDir/postgres-certs-out` directory.

**Prerequisites**: Config file must have `ssl: "enabled"` and `caConfig` specified.

**Options**:

- `-c, --config <path>` - Path to postgres run config file (required)
- `--overwriteConfig` - Overwrite existing certificate config files (default: false)
- `--overwriteCA` - Overwrite existing CA certificate and key (default: false)
- `--overwriteCerts` - Overwrite existing server certificate and key (default: false)
- `-s, --silent` - Silent mode

**Note**: If `overwriteCA` is true, certificates are also overwritten (because certificates signed by the old CA are no longer valid).

#### Start PostgreSQL Instance

```bash
softkave-forerunner postgres start [options]
```

**Description**: Starts a PostgreSQL instance in a Docker container. Can be called with a config file or with CLI arguments.

**Options**:

- `-c, --config <path>` - Path to postgres run config file (optional if CLI args provided)
- `-s, --silent` - Silent mode

**CLI Arguments** (when no config provided):

- `--port <port>` - Port number (required)
- `--container-name <name>` - Container name (required)
- `--working-dir <dir>` - Working directory
- `--version <version>` - PostgreSQL version (default: "16")
- `--volume-name <name>` - Volume name (defaults to container name)
- `--keep` - Keep data across restarts
- `--username <username>` - Admin username
- `--password <password>` - Admin password
- `--db <dbname>` - Default database name

**Authorization**: When both `--username` and `--password` are provided, authorization is set to `enabled` (scram-sha-256). When either is omitted, authorization is `disabled` (trust).

#### Stop PostgreSQL Instance

```bash
softkave-forerunner postgres stop [options]
```

**Description**: Stops a PostgreSQL instance. Can be called with a config file or just a container name.

**Options**:

- `-c, --config <path>` - Path to postgres run config file (optional if container name provided)
- `--container-name <name>` - Container name (required if no config)
- `--remove-volume` - Remove volume on stop (default: false)
- `-s, --silent` - Silent mode

#### Setup PostgreSQL Users

```bash
softkave-forerunner postgres setup-users -c <config-path> [options]
```

**Description**: Sets up PostgreSQL users (excluding the first admin user which is created via POSTGRES_USER/POSTGRES_PASSWORD). Creates users that don't exist and updates passwords for existing users. Syncs each user's database permissions (CONNECT/REVOKE) and connection types (TCP and/or local) from config to pg_hba.conf. If transitioning from trust to password authentication, automatically updates pg_hba.conf and postgresql.conf to use scram-sha-256.

**Prerequisites**: Expects PostgreSQL instance to be running and connects using the admin user from config.

**Options**: `-c, --config <path>` (required), `-s, --silent`

#### Setup PostgreSQL Databases

```bash
softkave-forerunner postgres setup-dbs -c <config-path> [options]
```

**Description**: Creates PostgreSQL databases that don't exist. The first database in config is created via POSTGRES_DB environment variable during container startup, so this command only creates additional databases.

**Prerequisites**: Expects PostgreSQL instance to be running and connects using the admin user from config.

**Options**: `-c, --config <path>` (required), `-s, --silent`

### Hosts File Management (`etc-hosts`)

Manage `/etc/hosts` file entries for local development.

**Platform Support:** These commands only work on Mac/Linux systems.

**Note:** Commands that write to the `/etc/hosts` file (set, backup, restore) will require sudo password unless you have configured passwordless sudo access for `/etc/hosts`.

#### Set Host Entry

```bash
softkave-forerunner etc-hosts set <hostname> [ip] [options]
```

**Arguments:**

- `hostname` - Hostname to set (required)
- `ip` - IP address (defaults to 127.0.0.1)

**Options:**

- `-f, --hosts-file <path>` - Path to hosts file (default: /etc/hosts)
- `-s, --silent` - Silent mode

#### Remove Host Entry

```bash
softkave-forerunner etc-hosts remove <hostname> [options]
```

**Arguments:** `hostname` (required)

**Options:** `-f, --hosts-file <path>` (default: /etc/hosts), `-s, --silent`

#### List Host Entries

```bash
softkave-forerunner etc-hosts list [options]
```

**Options:** `-f, --hosts-file <path>` (default: /etc/hosts), `-s, --silent`

#### Backup Hosts File

```bash
softkave-forerunner etc-hosts backup [options]
```

**Options:**

- `-f, --hosts-file <path>` - Path to hosts file (default: /etc/hosts)
- `-b, --backup-file <path>` - Path to backup file (default: /etc/hosts.backup)
- `-s, --silent` - Silent mode

#### Restore Hosts File

```bash
softkave-forerunner etc-hosts restore [options]
```

**Options:** `-f, --hosts-file <path>` (default: /etc/hosts), `-b, --backup-file <path>` (default: /etc/hosts.backup), `-s, --silent`

### Process Management (`pm`)

**Platform Support:** These commands only work on Linux and macOS systems. On other operating systems, the functionality may not be available.

#### Find Children PIDs

```bash
softkave-forerunner pm children-pids <pid> [options]
```

**Description**: Recursively finds all child process IDs (PIDs) of a given parent process ID. This command uses `pgrep -P` to traverse the process tree and identify all descendant processes.

**Arguments:**

- `pid` - Parent process ID to find children for (required)

**Options:**

- `-s, --silent` - Silent mode (suppress output)

**Example Output:**

```
Child PIDs of 1234:
  5678
  5679
  5680
  5681
Total: 4 child process(es)
```

**Use Cases:**

- Debugging process hierarchies
- Monitoring spawned child processes
- Process cleanup and management
- Understanding application process structure

**Example:**

```bash
# Find all child processes of PID 1234
softkave-forerunner pm children-pids 1234

# Find child processes in silent mode
softkave-forerunner pm children-pids 1234 --silent
```

### Run with selected env file (`run-env`)

Discovers `.env*` files in the current directory (e.g. `.env`, `.env.local`, `.env.development`), lets you choose one interactively, then runs the given command with that env. I/O is piped to the terminal.

**Usage:**

```bash
softkave-forerunner run-env [options] -- <command> [args...]
```

**Example:**

```bash
softkave-forerunner run-env -- npm run dev
```

**Options:**

- `-w, --cwd <path>` - Working directory to scan for `.env*` files and to run the command in (default: current directory)
- `-s, --silent` - Silent mode (suppress non-essential output such as "Using .env.foo")

**Behavior:** If no `.env*` files exist in the chosen directory, the command exits with an error. If exactly one file exists, it is used without prompting; if multiple exist, an interactive list is shown to select one.

### Security Management (`security`)

Security utilities for generating production-grade passwords and JWT secrets.

#### Generate Password

```bash
softkave-forerunner security password [options]
```

**Description**: Generates production-grade password(s) using cryptographically secure random generation. By default, generates passwords with uppercase, lowercase, numbers, symbols, and excludes visually similar characters.

**Options:**

- `-c, --count <number>` - Number of passwords to generate (default: 1)
- `-l, --length <number>` - Password length (default: 32)
- `--numbers` / `--no-numbers` - Include/exclude numbers (default: include)
- `--symbols` / `--no-symbols` - Include/exclude symbols (default: include)
- `--uppercase` / `--no-uppercase` - Include/exclude uppercase characters (default: include)
- `--lowercase` / `--no-lowercase` - Include/exclude lowercase characters (default: include)
- `--exclude-similar` / `--no-exclude-similar` - Exclude/allow visually similar characters like 'i' and 'I' (default: exclude)
- `--strict` / `--no-strict` - Require at least one character from each enabled pool (default: require)
- `--exclude <chars>` - Characters to exclude from password (default: "")
- `--symbols-set <chars>` - Custom symbols to use instead of default symbols (default: "")
- `-s, --silent` - Silent mode

**Examples:**

```bash
# Generate a single password with default settings
softkave-forerunner security password

# Generate 5 passwords
softkave-forerunner security password --count 5

# Generate a 16-character password without symbols
softkave-forerunner security password --length 16 --no-symbols

# Generate a password with custom symbols only
softkave-forerunner security password --symbols-set "!@#$%"

# Generate a password excluding certain characters
softkave-forerunner security password --exclude "0O1lIi"
```

#### Generate JWT Secret

```bash
softkave-forerunner security jwt-secret [options]
```

**Description**: Generates production-grade JWT secret(s) using cryptographically secure random bytes. Each secret is `length` bytes (default 64) encoded as base64, suitable for JWT signing.

**Options:**

- `-c, --count <number>` - Number of secrets to generate (default: 1)
- `-l, --length <number>` - Length in bytes of each secret (default: 64)
- `-s, --silent` - Silent mode

**Examples:**

```bash
# Generate a single JWT secret (64 bytes, default)
softkave-forerunner security jwt-secret

# Generate 3 JWT secrets
softkave-forerunner security jwt-secret --count 3

# Generate a JWT secret with custom length (e.g. 32 bytes)
softkave-forerunner security jwt-secret --length 32
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
# Start MongoDB instances, setup replica set, and setup users (recommended)
softkave-forerunner mongo start --setup-users -c mongo-config.json

# Deprecated: same as above
softkave-forerunner mongo setup-replica-set -c mongo-config.json

# Start MongoDB instances and setup replica set (if not already setup)
softkave-forerunner mongo start -c mongo-config.json

# Start MongoDB instances, setup replica set, and setup users
softkave-forerunner mongo start --setup-users -c mongo-config.json

# Stop MongoDB instances
softkave-forerunner mongo stop -c mongo-config.json

# Validate config file
softkave-forerunner mongo validate-config -c mongo-config.json

# Setup or sync users (if instances are already running)
softkave-forerunner mongo setup-users -c mongo-config.json

# Check replica set status
softkave-forerunner mongo replica-set-status -c mongo-config.json

# Rolling restart (e.g. after upgrading Mongo version or changing mongod config)
softkave-forerunner mongo restart -c mongo-config.json

# Print connection URI
softkave-forerunner mongo print-uri -c mongo-config.json
```

### PostgreSQL Management

```bash
# Generate configuration file interactively
softkave-forerunner postgres scaffold-config

# Generate configuration file with defaults
softkave-forerunner postgres scaffold-config --defaults

# Validate config file
softkave-forerunner postgres validate-config -c postgres-config.json

# Generate SSL certificates
softkave-forerunner postgres generate-certs -c postgres-config.json

# Start PostgreSQL instance with config file
softkave-forerunner postgres start -c postgres-config.json

# Start PostgreSQL instance with CLI arguments
softkave-forerunner postgres start --port 5432 --container-name postgres-db --username admin --password admin-password --db mydb

# Stop PostgreSQL instance with config file
softkave-forerunner postgres stop -c postgres-config.json

# Stop PostgreSQL instance with container name only
softkave-forerunner postgres stop --container-name postgres-db

# Setup users (excluding admin)
softkave-forerunner postgres setup-users -c postgres-config.json

# Setup databases (excluding default database)
softkave-forerunner postgres setup-dbs -c postgres-config.json
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

### Process Management

```bash
# Find all child processes of PID 1234
softkave-forerunner pm children-pids 1234

# Find child processes in silent mode
softkave-forerunner pm children-pids 1234 --silent
```

### Security Management

```bash
# Generate a single password
softkave-forerunner security password

# Generate 5 passwords
softkave-forerunner security password --count 5

# Generate a password with custom length
softkave-forerunner security password --length 16

# Generate a JWT secret
softkave-forerunner security jwt-secret

# Generate 3 JWT secrets
softkave-forerunner security jwt-secret --count 3

# Generate a JWT secret with custom length
softkave-forerunner security jwt-secret --length 32
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
- **Example**: `"8.0.13"`
- **Default**: Uses the latest stable version if not specified

**`systemLinux`** (string, optional if `os` is not `linux`)

- **Description**: The Linux distribution identifier for MongoDB download
- **Example**: `"ubuntu2404"`
- **Options**: `"ubuntu2404"`, `"ubuntu2204"`, `"rhel8"`, `"rhel9"`, etc.

**`os`** (string, optional)

- **Description**: The operating system platform
- **Example**: `"linux"`
- **Options**: `"linux"`, `"macos"`, `"windows"`

**`caConfig`** (object, required)

- **Description**: Certificate Authority configuration for MongoDB SSL/TLS certificates. SSL/TLS is always enabled for MongoDB instances; this configuration is required.
- **Properties**:
  - `days` (number): Certificate validity period in days
  - `subject` (object): X.509 certificate subject information
    - `C` (string): Country code (2 characters)
    - `ST` (string): State or province
    - `L` (string): Locality or city
    - `O` (string): Organization name
    - `CN` (string): Common name for the CA
  - `passphrase` (string, optional): Passphrase for the CA private key

**`hostnames`** (array, required)

- **Description**: Hostnames for each MongoDB instance in the replica set (one entry per instance). Each entry can be:
  - A **string** (single hostname)
  - An **array** that can mix **strings** and **objects** (multiple hostnames for the instance)
  - An **object** with `hostname` (string) and `resolution` (`"dns"` or `"local"`) - indicates how the hostname should be resolved
- **Resolution field**:
  - When `resolution` is `"dns"`, the hostname is resolved via DNS and is **not** bound to Docker bridge IP (`172.17.0.1`). Use this when the hostname is resolvable via DNS and containers can reach it directly.
  - When `resolution` is `"local"` or missing, the hostname is bound to Docker bridge IP (`172.17.0.1`) so containers can reach it via the bridge. Use this for hostnames that are not resolvable via DNS (e.g., entries in `/etc/hosts`).
- **Docker binding**: When starting MongoDB instances, only non-localhost hostnames with missing `resolution` or `resolution: "local"` are bound to Docker bridge. Hostnames with `resolution: "dns"` are not bound, assuming DNS resolution works from within containers.
- **Example (with string array & local resolution)**:
  ```json
  ["mongo-1.fimidara.local", "mongo-2.fimidara.local", "mongo-3.fimidara.local"]
  ```
- **Example (with resolution)**:
  ```json
  [
    {"hostname": "mongo-1.fimidara.local", "resolution": "dns"},
    {"hostname": "mongo-2.fimidara.local", "resolution": "local"},
    "mongo-3.fimidara.local"
  ]
  ```
- **Example (mixed array format)**:
  ```json
  [
    "mongo-1.fimidara.local",
    {"hostname": "mongo-2.fimidara.local", "resolution": "local"},
    [
      "mongo-3a.fimidara.local",
      {"hostname": "mongo-3b.fimidara.local", "resolution": "dns"}
    ]
  ]
  ```
- **Note**: Length must match `ports` and must be at least 3.

**`ports`** (array, required)

- **Description**: Port numbers for each MongoDB instance (one per instance)
- **Example**: `[27017, 27018, 27019]`
- **Note**: Length must match `hostnames` (minimum 3); ports must be unique

**`replicaSetName`** (string, required)

- **Description**: Name of the MongoDB replica set
- **Example**: `"fimidara-rs"`
- **Note**: All instances in the replica set must use the same name

**`authorization`** (`"enabled"` | `"disabled"`, optional)

- **Description**: Whether MongoDB authentication/authorization is enabled
- **Example**: `"enabled"`
- **Default**: `"enabled"`
- **Note**: When enabled, admin and cluster admin users in config are required for post-setup operations

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
- Any string. See [MongoDB self-managed built-in roles](https://www.mongodb.com/docs/manual/reference/built-in-roles/?deployment-type=self)

**Example MongoDB Configuration** (`src/mongo/examples/mongo-run-config.json`):

```json
{
  "workingDir": "./mongo-data",
  "mongoVersion": "8.0.13",
  "systemLinux": "ubuntu2404",
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
  "hostnames": [
    "mongo-1.fimidara.local",
    "mongo-2.fimidara.local",
    "mongo-3.fimidara.local"
  ],
  // Alternative with resolution (DNS-resolved hostnames are not bound to Docker bridge):
  // "hostnames": [
  //   {"hostname": "mongo-1.fimidara.local", "resolution": "dns"},
  //   {"hostname": "mongo-2.fimidara.local", "resolution": "local"},
  //   "mongo-3.fimidara.local"
  // ],
  "ports": [27017, 27018, 27019],
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

### PostgreSQL Configuration

The PostgreSQL commands require a configuration file that specifies port, container settings, authorization, SSL, users, and databases. Below is a detailed breakdown of each configuration option:

#### Configuration Options

**`workingDir`** (string, optional)

- **Description**: The working directory for certs and config cache
- **Example**: `"./postgres-data"`
- **Default**: Current working directory (`process.cwd()`)

**`port`** (number, required)

- **Description**: Port number for PostgreSQL instance
- **Example**: `5432`
- **Note**: Must be a positive integer

**`authorization`** (string, optional)

- **Description**: Whether to require password authentication
- **Values**: `"enabled"` (scram-sha-256) or `"disabled"` (trust)
- **Default**: `"disabled"`
- **Note**: When `"enabled"`, at least one user with a password is required

**`ssl`** (string, optional)

- **Description**: Whether to require SSL/TLS for connections
- **Values**: `"enabled"` or `"disabled"`
- **Default**: `"disabled"`
- **Note**: When `"enabled"`, `caConfig` is required (certs are generated or reused)

**`caConfig`** (object, optional)

- **Description**: CA configuration for SSL certificates (required when `ssl` is `"enabled"`). Same shape as [CA Configuration Options](#ca-configuration-options) (e.g. `outDir`, `days`, `subject`, `files`, `passphrase`).

**`postgresVersion`** (string, optional)

- **Description**: PostgreSQL version to use
- **Example**: `"16"`
- **Default**: `"16"`

**`containerName`** (string, required)

- **Description**: Docker container name
- **Example**: `"postgres-db"`
- **Note**: Must be unique

**`volumeName`** (string, optional)

- **Description**: Docker volume name for data persistence
- **Example**: `"postgres-db"`
- **Default**: Same as `containerName`

**`keep`** (boolean, optional)

- **Description**: Whether to keep data across restarts
- **Example**: `true`
- **Default**: `false`
- **Note**: When `false`, existing volumes are removed on start

**`discoverability`** (`"local"` | `"global"`, optional)

- **Description**: Controls whether the container is only discoverable locally or globally. When `"local"`, Docker port mapping uses `127.0.0.1:port` (only reachable from this host). When `"global"`, port mapping uses `port` (reachable from all interfaces).
- **Example**: `"local"`
- **Default**: `"local"`

**`users`** (array, optional)

- **Description**: PostgreSQL users. The first user is the admin (set via POSTGRES_USER/POSTGRES_PASSWORD). When authorization is enabled, all users must have a password.
- **Properties**:
  - `username` (string): User login name
  - `password` (string, optional): User password (required when authorization is enabled)
  - `databases` (array of strings, optional): Databases this user can connect to; must be a subset of `dbs`. If omitted, user can access all databases
  - `connectionTypes` (array, optional): Allowed connection types: `"tcp"` (host/hostssl) and/or `"local"` (Unix socket). If omitted, both are allowed

**`dbs`** (array of strings, optional)

- **Description**: Databases to create. The first is created via POSTGRES_DB during container startup.
- **Example**: `["mydb", "testdb"]`

**Example PostgreSQL Configuration** (`postgres-run-config.json`):

```json
{
  "workingDir": "./postgres-data",
  "port": 5432,
  "authorization": "enabled",
  "ssl": "disabled",
  "postgresVersion": "16",
  "containerName": "postgres-db",
  "volumeName": "postgres-db",
  "keep": true,
  "discoverability": "local",
  "users": [
    {
      "username": "admin",
      "password": "admin-password"
    },
    {
      "username": "appuser",
      "password": "app-password",
      "databases": ["mydb"],
      "connectionTypes": ["tcp"]
    }
  ],
  "dbs": ["mydb", "testdb"]
}
```

#### Authorization and authentication

- **`authorization: "disabled"`**: PostgreSQL uses trust authentication (no password). No users are required.
- **`authorization: "enabled"`**: PostgreSQL uses scram-sha-256. At least one user with a password is required. pg_hba.conf and postgresql.conf are set for password authentication; setup-users creates/updates users and syncs database permissions and connection types from config.
- **Discoverability**: By default, instances use `discoverability: "local"` (bind only to `127.0.0.1`). Set `discoverability: "global"` to make the container reachable from all interfaces.

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
  findChildrenPIDs,
  generatePassword,
  generateJwtSecret,
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

#### MongoDB Replicaset Setup

```typescript
import {setupReplicaSetMain, MongoRunConfig} from 'softkave-forerunner';

const mongoConfig: MongoRunConfig = {
  workingDir: './mongo-setup',
  mongoVersion: '8.0.13',
  systemLinux: 'ubuntu2404',
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
  hostnames: ['mongo1.local', 'mongo2.local', 'mongo3.local'],
  ports: [27017, 27018, 27019],
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

await setupReplicaSetMain({
  mongoRunConfig: mongoConfig,
  logger,
});
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

### Security Management

#### Generate Password

```typescript
import {generatePassword} from 'softkave-forerunner';

// Generate a single password with default settings
const password = generatePassword();
console.log('Generated password:', password);

// Generate multiple passwords
const passwords = generatePassword({count: 5});
console.log('Generated passwords:', passwords);

// Generate password with custom options
const customPassword = generatePassword({
  length: 16,
  numbers: true,
  symbols: false,
  uppercase: true,
  lowercase: true,
  excludeSimilarCharacters: true,
  strict: true,
});
console.log('Custom password:', customPassword);
```

**Options:**

- `count` (number, optional): Number of passwords to generate (default: 1)
- `length` (number, optional): Password length (default: 32)
- `numbers` (boolean, optional): Include numbers (default: true)
- `symbols` (boolean | string, optional): Include symbols or custom symbol set (default: true)
- `uppercase` (boolean, optional): Include uppercase characters (default: true)
- `lowercase` (boolean, optional): Include lowercase characters (default: true)
- `excludeSimilarCharacters` (boolean, optional): Exclude visually similar characters (default: true)
- `strict` (boolean, optional): Require at least one character from each pool (default: true)
- `exclude` (string, optional): Characters to exclude from password

#### Generate JWT Secret

```typescript
import {generateJwtSecret} from 'softkave-forerunner';

// Generate a single JWT secret
const secret = generateJwtSecret();
console.log('Generated JWT secret:', secret);

// Generate multiple JWT secrets
const secrets = generateJwtSecret(5);
console.log('Generated JWT secrets:', secrets);

// Generate a secret with custom length (e.g. 32 bytes)
const shortSecret = generateJwtSecret(1, 32);
```

**Parameters:**

- `count` (number, optional): Number of secrets to generate (default: 1)
- `length` (number, optional): Length in bytes of each secret (default: 64). Base64 encoding yields ~4/3 this length in characters.

**Returns:**

- Single secret string if `count` is 1 or not provided
- Array of secret strings if `count` > 1

**Note:** Each secret is `length` bytes encoded as base64, suitable for JWT signing. Default 64 bytes yields an 88-character string.

### Process Management

#### Find Children PIDs

```typescript
import {findChildrenPIDs} from 'softkave-forerunner';

// Find all child processes of a parent PID
const parentPid = 1234;
const childrenPids = await findChildrenPIDs(parentPid);

console.log(`Found ${childrenPids.length} child processes:`, childrenPids);
```

**Important Notes:**

- `findChildrenPIDs` only works on Linux and macOS systems
- Returns an array of all descendant PIDs (children, grandchildren, etc.)
- Throws an error if the parent process doesn't exist or if running on unsupported platforms

#### Process Instance Management

**Important Notes:**

- `startProcess` starts a background process that continues running even after the terminal or the initial program that started it stops
- Background processes can be stopped by calling `endPIDs` with the PID filepath passed to `startProcess`
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

## Release Notes

For information about changes, new features, and bug fixes in each version:

- **[v0 Series Release Notes](notes/releases/v0.md)** - Complete changelog for v0.x.x versions

## Help

For detailed help on any command:

```bash
softkave-forerunner <command> --help
softkave-forerunner <command> <subcommand> --help
```
