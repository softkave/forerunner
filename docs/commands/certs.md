# Certificate management (`certs`)

[← Commands](index.md)

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

#### Generate SSH Keypair

```bash
softkave-forerunner certs ssh-key [options]
```

**Two modes:**

- **Config file mode**: pass `--config` pointing to a JSON file
- **Flags mode**: omit `--config` and provide `--comment` and `--passphrase` (required)

**Options:**

- `-c, --config <path>` - Path to SSH key configuration JSON file (optional)
- `-f, --force` - Force regeneration even if key already exists
- `-w, --cwd <path>` - Working directory
- `-a, --algorithm <algorithm>` - `ed25519` | `rsa` | `ecdsa` (default: `ed25519`)
- `-b, --bits <bits>` - Key size in bits (RSA default: 4096, ECDSA default: 521; ignored for ed25519)
- `-C, --comment <comment>` - Key comment (**required unless `--config`**)
- `-p, --passphrase <passphrase>` - Key passphrase (**required unless `--config`**)
- `-P, --path <path>` - Output folder (ends with `/`) or file path (default: `./ssh-keys/`)
- `-s, --silent` - Silent mode

**Examples:**

```bash
# Flags mode (defaults to ed25519)
softkave-forerunner certs ssh-key -C "me@laptop" -p "my-passphrase" -P ./ssh-keys/

# RSA
softkave-forerunner certs ssh-key -a rsa -b 4096 -C "deploy-key" -p "my-passphrase" -P ./ssh-keys/deploy_key

# Config file mode
softkave-forerunner certs ssh-key -c ./ssh-key-config.json
```

#### Generate Keyfile

Generates a keyfile with secure randomness. By default it produces a **MongoDB-compatible** keyFile:

- base64 encoded
- newline-terminated
- chmod `0400`

```bash
softkave-forerunner certs keyfile [options]
```

**Two modes:**

- **Config file mode**: pass `--config` pointing to a JSON file
- **Flags mode**: omit `--config` and provide `--path` (required)

**Options:**

- `-c, --config <path>` - Path to keyfile configuration JSON file (optional)
- `-f, --force` - Force regeneration even if keyfile already exists
- `-w, --cwd <path>` - Working directory
- `-P, --path <path>` - Output filepath (**required unless `--config`**)
- `--format <format>` - `mongodb` | `generic` (default: `mongodb`)
- `--bytes <bytes>` - Random bytes before encoding (default: 756 for mongodb, 32 for generic)
- `--encoding <encoding>` - `base64` | `hex` (default: `base64`)
- `--mode <mode>` - File mode in octal (e.g. `400`, `600`) (default: `400`)
- `--newline` / `--no-newline` - Append trailing newline (default: append)

**Examples:**

```bash
# MongoDB keyFile (recommended defaults)
softkave-forerunner certs keyfile -P ./keyfiles/mongo.keyfile

# Generic hex keyfile
softkave-forerunner certs keyfile -P ./secrets/app.key --format generic --bytes 64 --encoding hex --mode 600

# Config file mode
softkave-forerunner certs keyfile -c ./keyfile-config.json
```
