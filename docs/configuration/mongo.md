# MongoDB configuration

[← Configuration](index.md)

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
- **Do not use localhost**: Hostnames must not be `localhost` (or `127.0.0.1`). Each replica set member is run in its own container; from inside a container, `localhost` refers to that container only, so other members would not be discoverable when setting up the replica set. Use non-localhost hostnames (e.g. `mongo-1.example.local`) and discovered through DNS by setting `resolution` to `dns`, or set `resolution` to `local` to bind to the Docker IP bridge.
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

**`labels`** (object, optional)

- **Description**: Docker labels applied to each `mongod` container on `mongo start`
- **Example**:
  ```json
  {"com.mycompany.env": "dev", "com.mycompany.service": "mongo"}
  ```

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
