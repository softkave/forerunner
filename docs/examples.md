# Examples

[← Documentation](README.md)

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

# Sync users from config with the running instance (includes admin from config)
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
# Start a background app with env files and PID tracking
softkave-forerunner pm start --name my-app \
  --start-cmd ./start.sh --cwd /var/run/my-app-0 --logs-dir ./logs \
  --pids-file ./pids/my-app-0 -e .env -e .env.local

# Find all child processes of PID 1234
softkave-forerunner pm children-pids 1234

# Find child processes in silent mode
softkave-forerunner pm children-pids 1234 --silent
```

### Run env

```bash
# Checkbox prompt when multiple .env* files exist (Space toggles, Enter confirms)
softkave-forerunner run-env --cmd npm --cmd-args "run dev"

# Fixed file list (no prompt); .env.local overrides .env
softkave-forerunner run-env -e .env -e .env.local --cmd npm --cmd-args "run dev"
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
