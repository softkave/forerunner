# MongoDB management (`mongo`)

[← Commands](index.md)

## Commands

- [`scaffold-config`](#scaffold-mongodb-configuration) — Generate MongoDB configuration file
- [`validate-config`](#validate-mongodb-configuration) — Validate MongoDB configuration file
- [`setup-replica-set`](#setup-replica-set-deprecated) — Setup replica set (deprecated)
- [`generate-certs`](#generate-certificates) — Generate MongoDB certificate configs and certificates
- [`start`](#start-mongodb-instances) — Start MongoDB instances
- [`stop`](#stop-mongodb-instances) — Stop MongoDB instances
- [`setup-users`](#setup-mongodb-users) — Setup MongoDB users
- [`print-uri`](#print-mongodb-uri) — Print MongoDB connection URI
- [`replica-set-status`](#print-replica-set-status) — Print replica set status
- [`restart`](#restart-mongodb-rolling-restart) — Rolling restart of replica set members

MongoDB replica set management. **Only replica sets are supported**; standalone (single-node) instances are not supported.

**Docker is required** for mongo operations (start, stop, setup-replica-set, restart, etc.); instances run as Docker containers. If Docker is missing, commands print a platform-specific install link (see [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/), [Windows](https://docs.docker.com/desktop/setup/install/windows-install/), or [Docker Engine for Linux](https://docs.docker.com/engine/install/)).

**Connecting**: Instances use self-generated TLS certificates. Connect with `tls=true&tlsAllowInvalidCertificates=true` in the URI, or generate a ready-to-use URI with [`mongo print-uri`](#print-mongodb-uri) (includes those params by default).

**When authorization is enabled:** Both an admin user (with `userAdminAnyDatabase`) and a cluster admin user (with `clusterAdmin`) are required in config. The admin user is used for user management, and the cluster admin user is required for replica set operations such as restart, status, and reconfig. If replica-set initialization is enabled on start, forerunner will enforce that both users are present and will create/sync them as part of startup.

#### Quick start from the CLI

Use this when you want to bring up a local MongoDB replica set without creating a JSON config first. Forerunner will build a temporary run config from the flags you provide and then start the instances.

```bash
softkave-forerunner mongo start \
  --container-name mymongo \
  --port 27017 27018 27019 \
  --user admin \
  --password secret \
  --setup-users
```

**What to know:**

- At least 3 ports are required for a replica set.
- `--hostname <names...>` lets you provide one non-localhost hostname per instance; if you omit it, Forerunner uses generated `.mongo.test` hostnames.
- `--etc-hosts-setup <mode>` controls how those hostnames are made resolvable: `prompt` (default), `add`, `manual`, or `skip`. If you already manage `/etc/hosts` yourself, prefer `skip` or `manual`.
- `--setup-users` initializes the configured admin and cluster-admin users after startup.

#### Scaffold MongoDB Configuration

```bash
softkave-forerunner mongo scaffold-config [options]
```

**Description**: Generates a MongoDB configuration file interactively or using default values. This command prompts for all necessary configuration options including working directory, MongoDB version, SSL/TLS certificate authority configuration (SSL is always enabled), replica set configuration, instance ports and hostnames, and user authentication settings. When authorization is enabled, the scaffold flow now creates both an admin user and a cluster admin user.

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

**Description**: Validates the MongoDB configuration file. Checks that the file is valid JSON and that the content conforms to the run config schema. Prints clear validation errors to the console (e.g. missing required fields, invalid values, user/database constraints). When authorization is enabled, validation also requires both an admin user and a cluster admin user.

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
softkave-forerunner mongo start [options]
softkave-forerunner mongo start -c <config-path> [options]
```

**Description**: Starts MongoDB instances and sets up the replica set (if not already setup). **If not already present**, this command will automatically generate certificate configs and certificates before starting instances. SSL/TLS is always enabled. The replica set is initialized automatically if it hasn't been initialized yet. Use `--setup-users` to also setup users after starting.

When `-c, --config` is omitted, Forerunner uses a temporary in-memory config generated from the CLI flags for local development. This is the quickest way to start a local replica set without writing a config file.

**Options:**

- `-c, --config <path>` - Path to mongo run config file (optional; if omitted, a temporary config is generated from CLI flags)
- `--container-name <name>` - Container name prefix for quick start (required when no config is provided)
- `--port <ports...>` - Port numbers for the replica set members; at least 3 are required for quick start
- `--working-dir <path>` - Working directory for data/certs (used by quick start)
- `--version <version>` - MongoDB version for quick start
- `--replica-set-name <name>` - Replica set name for quick start
- `--docker-network <name>` - Docker network name for quick start
- `--hostname <names...>` - One non-localhost hostname per instance for quick start
- `--etc-hosts-setup <mode>` - How to resolve generated hostnames: `prompt`, `add`, `manual`, or `skip`
- `--user <username>` - Admin username (enables auth when paired with `--password`)
- `--password <password>` - Admin password (enables auth when paired with `--user`)
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

**Description**: Prints the MongoDB connection URI for the given config (replica set or single instance). The URI includes `tls=true&tlsAllowInvalidCertificates=true` by default so clients can connect with the self-generated certificates.

**Options**:

- `-c, --config <path>` - Path to mongo run config file (required)
- `--connection-type <type>` - `instance` or `replicaSet` (default: "replicaSet")
- `--instance-number <number>` - Instance number for instance connection type (default: "1")
- `-u, --username <username>` - Username for authentication
- `-p, --password <password>` - Password for authentication
- `--db <database>` - Database name to include in the URI
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
