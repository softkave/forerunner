# Run env (`run-env`)

[← Commands](index.md)

Runs a command with variables loaded from dotenv-style files, merged on top of the current process environment. Standard input, output, and error are inherited by the child process.

**Usage:**

```bash
softkave-forerunner run-env [options] --cmd <command> [--cmd-args <args>]
```

**Two modes:**

1. **Explicit files** — Pass one or more `-e` / `--env-file` paths. Those files are loaded in order (later files override earlier ones). Discovery and interactive selection are skipped. Paths are relative to `--cwd` unless absolute.

2. **Discovery** — With no `-e` / `--env-file`, forerunner discovers `.env*` files in the working directory (e.g. `.env`, `.env.local`, `.env.development`). If exactly one file exists, it is used automatically. If several exist, a checkbox prompt appears: **Space** toggles each file, **Enter** confirms your selection (at least one required). **A** selects all, **I** inverts the selection. Variables are merged in **discovery order** among the files you checked (later files override earlier keys), not in the order you toggled them.

**Examples:**

```bash
softkave-forerunner run-env --cmd npm --cmd-args "run dev"

softkave-forerunner run-env -e .env -e .env.local --cmd npm --cmd-args "run dev"

softkave-forerunner run-env -w ./my-app -e config/.env --cmd npm --cmd-args "run build"
```

**Options:**

- `-w, --cwd <path>` - Working directory: where the command runs, where relative `--env-file` paths resolve, and where `.env*` discovery runs (default: current directory)
- `-e, --env-file <path>` - Env file to load; repeat for multiple files in merge order (optional; omit to use discovery / checkbox prompt when several files exist)
- `--cmd <command>` - Shell command to run (required; quote if it contains multiple words). Named `--cmd` instead of `-c` so it does not collide with `sh -c` or `npx -c`.
- `--cmd-args <args>` - Extra args passed to the command as a single string. Useful when you want `--cmd` to be just the executable (e.g. `--cmd node`) and pass flags separately.
- `-s, --silent` - Silent mode (suppress non-essential output such as which env file(s) were used)

**Behavior:** In discovery mode, if no `.env*` files exist in the chosen directory, the command exits with an error (use `-e` to point at explicit files instead). With `-e`, each path must be readable; missing files produce a clear error.

**Migration:** Older versions accepted the child command after `--` (e.g. `run-env -- npm run dev`). Replace that with `--cmd` (and optionally `--cmd-args`) (e.g. `run-env --cmd npm --cmd-args "run dev"`).

## SDK

```typescript
import {
  loadEnvForCwd,
  loadMergedEnvFromAbsolutePaths,
  runWithEnvMain,
  ConsoleForeLogger,
} from 'softkave-forerunner';

// Discovery or explicit paths (same rules as CLI)
const {env, logLabels} = await loadEnvForCwd({
  cwd: process.cwd(),
  envFilePaths: ['.env', '.env.local'], // omit for discovery / prompt
});

// Or merge from absolute paths directly
const merged = await loadMergedEnvFromAbsolutePaths([
  '/app/.env',
  '/app/.env.local',
]);

const logger = new ConsoleForeLogger({silent: false});
await runWithEnvMain({
  cwd: process.cwd(),
  cmd: 'npm',
  cmdArgs: 'run dev',
  envFilePaths: ['.env'],
  logger,
});
```
