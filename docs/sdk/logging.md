# SDK: Logging

[← SDK](index.md)

```typescript
import {ConsoleForeLogger, IForeLogger} from 'softkave-forerunner';

// Create logger instance
const logger = new ConsoleForeLogger({silent: false});

// Use logger
logger.log('Info message');
logger.error('Error message');
logger.table([{name: 'John', age: 30}]);

// Custom logger implementation
class CustomLogger implements IForeLogger {
  log(message: unknown, ...args: unknown[]): void {
    console.log('[LOG]', message, ...args);
  }

  error(message: unknown, ...args: unknown[]): void {
    console.error('[ERROR]', message, ...args);
  }

  table(tabularData: unknown, properties?: readonly string[]): void {
    console.table(tabularData, properties);
  }

  onSilentFail(message: unknown): void {
    // Handle silent failures
  }
}
```
