# softkave-forerunner

Application runner & helpers — a CLI tool and Node.js SDK for managing certificates, MongoDB instances, PostgreSQL, the system hosts file, processes, env files, and more.

## Overview

Forerunner provides tools for:

- **Certificate management**: Generate CAs, signed certificates, SSH keypairs, and keyfiles
- **MongoDB management**: Download, configure, and run MongoDB replica sets (Docker)
- **PostgreSQL management**: Run and configure PostgreSQL instances (Docker)
- **Hosts file management**: Manage `/etc/hosts` entries for local development
- **Process management**: Start background apps with PID/log tracking; find child PIDs
- **Run env**: Run commands with variables from `.env*` files (discovery, multi-select, or explicit paths)
- **Security**: Generate production-grade passwords and JWT secrets

## Quick start

### Install

```bash
npm install softkave-forerunner
# or
npx softkave-forerunner
```

### CLI

```bash
softkave-forerunner <command> [subcommand] [options]
```

### SDK

```typescript
import {generateCA, initMongo} from 'softkave-forerunner';
```

## Documentation

Detailed guides are in **[docs/](docs/README.md)**:

| Topic               | Link                                               |
| ------------------- | -------------------------------------------------- |
| Installation        | [docs/installation.md](docs/installation.md)       |
| Usage (CLI & SDK)   | [docs/usage.md](docs/usage.md)                     |
| Commands            | [docs/commands/](docs/commands/index.md)           |
| Configuration files | [docs/configuration/](docs/configuration/index.md) |
| SDK reference       | [docs/sdk/](docs/sdk/index.md)                     |
| Examples            | [docs/examples.md](docs/examples.md)               |

## Release notes

See **[notes/releases/v0.x.x.md](notes/releases/v0.x.x.md)** for version history and migration notes.

## Help

```bash
softkave-forerunner <command> --help
softkave-forerunner <command> <subcommand> --help
```
