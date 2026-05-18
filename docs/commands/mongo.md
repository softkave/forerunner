# MongoDB management (`mongo`)

[← Commands](index.md)

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
