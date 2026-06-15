# PostgreSQL configuration

[← Configuration](index.md)

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
- **Example**: `"18"`
- **Default**: `"18"`

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

**`labels`** (object, optional)

- **Description**: Docker labels applied to the Postgres container on `postgres start` (same idea as `docker run --label`).
- **Example**:
  ```json
  {"com.mycompany.env": "dev", "com.mycompany.service": "postgres"}
  ```
- **Note**: Keys must be non-empty strings; values are strings (matches run config validation).

**Example PostgreSQL Configuration** (`postgres-run-config.json`):

```json
{
  "workingDir": "./postgres-data",
  "port": 5432,
  "authorization": "enabled",
  "ssl": "disabled",
  "postgresVersion": "18",
  "containerName": "postgres-db",
  "volumeName": "postgres-db",
  "keep": true,
  "discoverability": "local",
  "labels": {
    "com.mycompany.env": "dev",
    "com.mycompany.service": "postgres"
  },
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
