# Process management (`pm`)

[← Commands](index.md)

**Platform support:** `pm children-pids` only works on Linux and macOS. `pm start` is supported on Linux and macOS (background detached processes).

#### Start background process

```bash
softkave-forerunner pm start [options]
```

**Description**: Starts a background process from a start script, writes stdout/stderr to timestamped log files, and optionally records the PID in a PID file. The process keeps running after the CLI exits (detached). Use [`endPIDs`](../sdk/pid-management.md) with the same PID file to stop it later.

The start script is executed directly if it is executable; otherwise it is run via `bash`.

**Options:**

- `--name <name>` — Application name written to the PID file (required)
- `--run-name <runName>` — Prefix for log filenames (default: `--name`)
- `--start-cmd <path>` — Path to the start script (required)
- `--logs-dir <path>` — Directory for stdout/stderr log files (required)
- `--cwd <path>` — Working directory for the started process (default: current directory)
- `--pids-file <path>` — File where the process PID is recorded (optional)
- `-e, --env-file <path>` — Env file to load; repeat for multiple (later overrides earlier). Paths relative to `--cwd` unless absolute. Same merge semantics as [`run-env`](run-env.md).
- `-s, --silent` — Silent mode

**Examples:**

```bash
# Start an app with env files and PID tracking
softkave-forerunner pm start --name my-app \
  --start-cmd ./start.sh --cwd /var/run/my-app-0 --logs-dir ./logs \
  --pids-file ./pids/my-app-0 -e .env -e .env.local

# Minimal start (no env files, no PID file)
softkave-forerunner pm start --name worker \
  --start-cmd ./run-worker.sh --logs-dir ./logs
```

See also: [SDK: Process management](../sdk/process-management.md).

#### Find Children PIDs

```bash
softkave-forerunner pm children-pids <pid> [options]
```

**Description**: Recursively finds all child process IDs (PIDs) of a given parent process ID. This command uses `pgrep -P` to traverse the process tree and identify all descendant processes.

**Arguments:**

- `pid` - Parent process ID to find children for (required)

**Options:**

- `-s, --silent` - Silent mode (suppress output)

**Example Output:**

```
Child PIDs of 1234:
  5678
  5679
  5680
  5681
Total: 4 child process(es)
```

**Use Cases:**

- Debugging process hierarchies
- Monitoring spawned child processes
- Process cleanup and management
- Understanding application process structure

**Example:**

```bash
# Find all child processes of PID 1234
softkave-forerunner pm children-pids 1234

# Find child processes in silent mode
softkave-forerunner pm children-pids 1234 --silent
```
