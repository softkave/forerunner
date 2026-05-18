# PostgreSQL management (`postgres`)

[← Commands](index.md)

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

**Description**: Syncs **every** user listed in the run config with the running instance. The first user is typically created by the container image (`POSTGRES_USER` / `POSTGRES_PASSWORD`); this command still updates that user when present (password, grants, `pg_hba` entries) alongside any additional users. Creates roles that do not exist, updates passwords when provided in config, and syncs each user's database permissions (CONNECT/REVOKE) and connection types (TCP and/or local) to `pg_hba.conf`. If transitioning from trust to password authentication, updates `pg_hba.conf` and `postgresql.conf` for scram-sha-256.

**Prerequisites**: Expects PostgreSQL instance to be running and connects using the admin user from config.

**Options**: `-c, --config <path>` (required), `-s, --silent`

#### Setup PostgreSQL Databases

```bash
softkave-forerunner postgres setup-dbs -c <config-path> [options]
```

**Description**: Creates PostgreSQL databases that don't exist. The first database in config is created via POSTGRES_DB environment variable during container startup, so this command only creates additional databases.

**Prerequisites**: Expects PostgreSQL instance to be running and connects using the admin user from config.

**Options**: `-c, --config <path>` (required), `-s, --silent`
