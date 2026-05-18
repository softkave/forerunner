# SDK: Process management

[← SDK](index.md)

#### Find Children PIDs

```typescript
import {findChildrenPIDs} from 'softkave-forerunner';

// Find all child processes of a parent PID
const parentPid = 1234;
const childrenPids = await findChildrenPIDs(parentPid);

console.log(`Found ${childrenPids.length} child processes:`, childrenPids);
```

**Important Notes:**

- `findChildrenPIDs` only works on Linux and macOS systems
- Returns an array of all descendant PIDs (children, grandchildren, etc.)
- Throws an error if the parent process doesn't exist or if running on unsupported platforms

#### Start background process (`startProcess`)

**Important notes:**

- `startProcess` starts a detached background process that keeps running after the caller exits
- Stop it with [`endPIDs`](pid-management.md) using the same PID file path
- Tested on macOS and Linux

```typescript
import {startProcess, IInstanceOpts} from 'softkave-forerunner';

const instance: IInstanceOpts = {
  name: 'my-service',
  runName: 'my-service-run',
  startCmdFilepath: './start-script.sh',
  logsFolderpath: './logs',
  cwd: process.cwd(),
  env: {NODE_ENV: 'development'},
  pidsFilepath: './pids.json',
};

const result = await startProcess(instance);
console.log('Process started:', result.pid);
console.log('Logs:', result.logsFilepath, result.errorLogsFilepath);
```

#### Start background process (`startProcessCLI`)

Programmatic equivalent of [`pm start`](../commands/pm.md#start-background-process). Loads env files when `envFilePaths` is set (via `loadEnvForCwd`), then calls `startProcess`.

```typescript
import {startProcessCLI, ConsoleForeLogger} from 'softkave-forerunner';

const logger = new ConsoleForeLogger({silent: false});

await startProcessCLI({
  opts: {
    name: 'my-app',
    runName: 'my-app',
    startCmd: './start.sh',
    cwd: '/var/run/my-app-0',
    logsDir: './logs',
    pidsFile: './pids/my-app-0.json',
    envFilePaths: ['.env', '.env.local'],
  },
  logger,
});
```
