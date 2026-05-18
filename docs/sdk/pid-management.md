# SDK: PID management

[← SDK](index.md)

```typescript
import {writePIDs, getPIDs, endPIDs, IProcessIdItem} from 'softkave-forerunner';

// Write PIDs to file
const pids: IProcessIdItem[] = [
  {name: 'service1', pid: '1234'},
  {name: 'service2', pid: '5678'},
];

await writePIDs(pids, {pidsFilepath: './pids.json'});

// Read PIDs from file
const existingPids = await getPIDs({pidsFilepath: './pids.json'});

// End processes by PIDs
await endPIDs(pids, {pidsFilepath: './pids.json'});
```
