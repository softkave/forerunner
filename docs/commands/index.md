# Commands

Command reference for the Forerunner CLI.

## Command overview

### Certificate management

- [`certs ca`](certs.md#generate-certificate-authority) — Generate Certificate Authority
- [`certs cert`](certs.md#generate-certificate) — Generate signed certificate
- [`certs ssh-key`](certs.md#generate-ssh-keypair) — Generate an SSH keypair using `ssh-keygen`
- [`certs keyfile`](certs.md#generate-keyfile) — Generate a keyfile (e.g. MongoDB keyFile)

### MongoDB management

- [`mongo scaffold-config`](mongo.md#scaffold-mongodb-configuration) — Generate MongoDB configuration file
- [`mongo validate-config`](mongo.md#validate-mongodb-configuration) — Validate MongoDB configuration file
- [`mongo setup-replica-set`](mongo.md#setup-replica-set-deprecated) — Setup replica set (deprecated: use `start --setup-users`)
- [`mongo generate-certs`](mongo.md#generate-certificates) — Generate MongoDB certificate configs and certificates
- [`mongo start`](mongo.md#start-mongodb-instances) — Start MongoDB instances (generates certs if not present)
- [`mongo stop`](mongo.md#stop-mongodb-instances) — Stop MongoDB instances
- [`mongo setup-users`](mongo.md#setup-mongodb-users) — Setup MongoDB users
- [`mongo print-uri`](mongo.md#print-mongodb-uri) — Print MongoDB connection URI
- [`mongo replica-set-status`](mongo.md#print-replica-set-status) — Print replica set status
- [`mongo restart`](mongo.md#restart-mongodb-rolling-restart) — Rolling restart of replica set members

### PostgreSQL management

- [`postgres scaffold-config`](postgres.md#scaffold-configuration) — Generate PostgreSQL configuration file
- [`postgres validate-config`](postgres.md#validate-postgresql-configuration) — Validate PostgreSQL configuration file
- [`postgres generate-certs`](postgres.md#generate-certificates) — Generate PostgreSQL certificates
- [`postgres start`](postgres.md#start-postgresql-instance) — Start PostgreSQL instance
- [`postgres stop`](postgres.md#stop-postgresql-instance) — Stop PostgreSQL instance
- [`postgres setup-users`](postgres.md#setup-postgresql-users) — Setup PostgreSQL users
- [`postgres setup-dbs`](postgres.md#setup-postgresql-databases) — Setup PostgreSQL databases
- [`postgres print-uri`](postgres.md#print-postgresql-uri) — Print PostgreSQL connection URI

### Hosts file management

- [`etc-hosts set`](etc-hosts.md#set-host-entry) — Set host entry
- [`etc-hosts remove`](etc-hosts.md#remove-host-entry) — Remove host entry
- [`etc-hosts list`](etc-hosts.md#list-host-entries) — List host entries
- [`etc-hosts backup`](etc-hosts.md#backup-hosts-file) — Backup hosts file
- [`etc-hosts restore`](etc-hosts.md#restore-hosts-file) — Restore hosts file

### Process management

- [`pm start`](pm.md#start-background-process) — Start a background process with PID and log tracking
- [`pm children-pids`](pm.md#find-children-pids) — Find all child PIDs of a parent PID

### Run env

- [`run-env`](run-env.md) — Run a command with selected or explicit `.env*` files

### Security

- [`security password`](security.md#generate-password) — Generate production-grade password(s)
- [`security jwt-secret`](security.md#generate-jwt-secret) — Generate production-grade JWT secret(s)
