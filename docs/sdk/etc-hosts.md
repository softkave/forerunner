# SDK: Hosts file management

[← SDK](index.md)

```typescript
import {
  setHost,
  removeHost,
  listHosts,
  backupHostsFile,
  restoreHostsFile,
  HostEntry,
} from 'softkave-forerunner';

// Set a host entry
setHost({
  hostname: 'example.com',
  ip: '127.0.0.1',
  hostsFilePath: '/etc/hosts',
  logger,
});

// Remove a host entry
removeHost({
  hostname: 'example.com',
  hostsFilePath: '/etc/hosts',
  logger,
});

// List all host entries
const entries: HostEntry[] = listHosts({
  hostsFilePath: '/etc/hosts',
  logger,
});

// Backup hosts file
backupHostsFile({
  hostsFilePath: '/etc/hosts',
  backupFilePath: '/etc/hosts.backup',
  logger,
});

// Restore hosts file
restoreHostsFile({
  hostsFilePath: '/etc/hosts',
  backupFilePath: '/etc/hosts.backup',
  logger,
});
```
