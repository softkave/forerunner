# SDK usage

Forerunner can be used as a Node.js SDK for programmatic access to all functionality.

## Installation

```bash
npm install softkave-forerunner
```

## Basic usage

```typescript
import {
  generateCA,
  generateCert,
  runMongo,
  setHost,
  removeHost,
  findChildrenPIDs,
  startProcess,
  generatePassword,
  generateJwtSecret,
  ConsoleForeLogger,
} from 'softkave-forerunner';

const logger = new ConsoleForeLogger({silent: false});
```

## Topics

- [Certificate management](certificates.md)
- [MongoDB management](mongo.md)
- [Hosts file management](etc-hosts.md)
- [Security management](security.md)
- [Process management](process-management.md) — `startProcess`, `startProcessCLI`, `findChildrenPIDs`
- [PID management](pid-management.md) — `writePIDs`, `getPIDs`, `endPIDs`
- [Logging](logging.md) — `ConsoleForeLogger` and custom loggers

Env loading (`loadEnvForCwd`, `runWithEnvMain`) is documented under [Run env](../commands/run-env.md#sdk).
