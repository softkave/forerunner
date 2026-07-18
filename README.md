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

## Commands

### [`certs`](docs/commands/certs.md) — Certificate management

- [`ca`](docs/commands/certs.md#generate-certificate-authority) — Generate Certificate Authority
- [`cert`](docs/commands/certs.md#generate-certificate) — Generate signed certificate
- [`ssh-key`](docs/commands/certs.md#generate-ssh-keypair) — Generate an SSH keypair
- [`keyfile`](docs/commands/certs.md#generate-keyfile) — Generate a keyfile (e.g. MongoDB keyFile)

### [`mongo`](docs/commands/mongo.md) — MongoDB management

- [`scaffold-config`](docs/commands/mongo.md#scaffold-mongodb-configuration) — Generate MongoDB configuration file
- [`validate-config`](docs/commands/mongo.md#validate-mongodb-configuration) — Validate MongoDB configuration file
- [`setup-replica-set`](docs/commands/mongo.md#setup-replica-set-deprecated) — Setup replica set (deprecated)
- [`generate-certs`](docs/commands/mongo.md#generate-certificates) — Generate MongoDB certificates
- [`start`](docs/commands/mongo.md#start-mongodb-instances) — Start MongoDB instances
- [`stop`](docs/commands/mongo.md#stop-mongodb-instances) — Stop MongoDB instances
- [`setup-users`](docs/commands/mongo.md#setup-mongodb-users) — Setup MongoDB users
- [`print-uri`](docs/commands/mongo.md#print-mongodb-uri) — Print MongoDB connection URI
- [`replica-set-status`](docs/commands/mongo.md#print-replica-set-status) — Print replica set status
- [`restart`](docs/commands/mongo.md#restart-mongodb-rolling-restart) — Rolling restart of replica set members

### [`postgres`](docs/commands/postgres.md) — PostgreSQL management

- [`scaffold-config`](docs/commands/postgres.md#scaffold-configuration) — Generate PostgreSQL configuration file
- [`validate-config`](docs/commands/postgres.md#validate-postgresql-configuration) — Validate PostgreSQL configuration file
- [`generate-certs`](docs/commands/postgres.md#generate-certificates) — Generate PostgreSQL certificates
- [`start`](docs/commands/postgres.md#start-postgresql-instance) — Start PostgreSQL instance
- [`stop`](docs/commands/postgres.md#stop-postgresql-instance) — Stop PostgreSQL instance
- [`setup-users`](docs/commands/postgres.md#setup-postgresql-users) — Setup PostgreSQL users
- [`setup-dbs`](docs/commands/postgres.md#setup-postgresql-databases) — Setup PostgreSQL databases
- [`print-uri`](docs/commands/postgres.md#print-postgresql-uri) — Print PostgreSQL connection URI

### [`etc-hosts`](docs/commands/etc-hosts.md) — Hosts file management

- [`set`](docs/commands/etc-hosts.md#set-host-entry) — Set host entry
- [`remove`](docs/commands/etc-hosts.md#remove-host-entry) — Remove host entry
- [`list`](docs/commands/etc-hosts.md#list-host-entries) — List host entries
- [`backup`](docs/commands/etc-hosts.md#backup-hosts-file) — Backup hosts file
- [`restore`](docs/commands/etc-hosts.md#restore-hosts-file) — Restore hosts file

### [`pm`](docs/commands/pm.md) — Process management

- [`start`](docs/commands/pm.md#start-background-process) — Start a background process with PID and log tracking
- [`children-pids`](docs/commands/pm.md#find-children-pids) — Find all child PIDs of a parent PID

### [`run-env`](docs/commands/run-env.md) — Run with env files

- [`run-env`](docs/commands/run-env.md) — Run a command with selected or explicit `.env*` files

### [`security`](docs/commands/security.md) — Security utilities

- [`password`](docs/commands/security.md#generate-password) — Generate production-grade password(s)
- [`jwt-secret`](docs/commands/security.md#generate-jwt-secret) — Generate production-grade JWT secret(s)

## Release notes

See **[notes/releases/v0.x.x.md](notes/releases/v0.x.x.md)** for version history and migration notes.

## Help

```bash
softkave-forerunner <command> --help
softkave-forerunner <command> <subcommand> --help
```
