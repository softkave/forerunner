# SDK: MongoDB management

[← SDK](index.md)

#### MongoDB Replicaset Setup

```typescript
import {setupReplicaSetMain, MongoRunConfig} from 'softkave-forerunner';

const mongoConfig: MongoRunConfig = {
  workingDir: './mongo-setup',
  mongoVersion: '8.0.13',
  systemLinux: 'ubuntu2404',
  os: 'linux',
  caConfig: {
    days: 365,
    subject: {
      C: 'US',
      ST: 'California',
      L: 'San Francisco',
      O: 'My Company',
      CN: 'MongoDB CA',
    },
    passphrase: 'optional-passphrase',
  },
  hostnames: ['mongo1.local', 'mongo2.local', 'mongo3.local'],
  ports: [27017, 27018, 27019],
  replicaSetName: 'rs0',
  users: [
    {
      username: 'admin',
      password: 'admin123',
      authDb: 'admin',
      roles: [
        {
          role: 'userAdminAnyDatabase',
          db: 'admin',
        },
      ],
    },
    {
      username: 'app-user',
      password: 'app123',
      authDb: 'myapp',
      roles: [
        {
          role: 'readWrite',
          db: 'myapp',
        },
      ],
    },
  ],
};

await setupReplicaSetMain({
  mongoRunConfig: mongoConfig,
  logger,
});
```
