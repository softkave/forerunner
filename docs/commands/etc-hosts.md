# Hosts file management (`etc-hosts`)

[← Commands](index.md)

Manage `/etc/hosts` file entries for local development.

**Platform Support:** These commands only work on Mac/Linux systems.

**Note:** Commands that write to the `/etc/hosts` file (set, backup, restore) will require sudo password unless you have configured passwordless sudo access for `/etc/hosts`.

#### Set Host Entry

```bash
softkave-forerunner etc-hosts set <hostname> [ip] [options]
```

**Arguments:**

- `hostname` - Hostname to set (required)
- `ip` - IP address (defaults to 127.0.0.1)

**Options:**

- `-f, --hosts-file <path>` - Path to hosts file (default: /etc/hosts)
- `-s, --silent` - Silent mode

#### Remove Host Entry

```bash
softkave-forerunner etc-hosts remove <hostname> [options]
```

**Arguments:** `hostname` (required)

**Options:** `-f, --hosts-file <path>` (default: /etc/hosts), `-s, --silent`

#### List Host Entries

```bash
softkave-forerunner etc-hosts list [options]
```

**Options:** `-f, --hosts-file <path>` (default: /etc/hosts), `-s, --silent`

#### Backup Hosts File

```bash
softkave-forerunner etc-hosts backup [options]
```

**Options:**

- `-f, --hosts-file <path>` - Path to hosts file (default: /etc/hosts)
- `-b, --backup-file <path>` - Path to backup file (default: /etc/hosts.backup)
- `-s, --silent` - Silent mode

#### Restore Hosts File

```bash
softkave-forerunner etc-hosts restore [options]
```

**Options:** `-f, --hosts-file <path>` (default: /etc/hosts), `-b, --backup-file <path>` (default: /etc/hosts.backup), `-s, --silent`
