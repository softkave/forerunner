# SDK: Certificate management

[← SDK](index.md)

#### Generate Certificate Authority

```typescript
import {generateCA, CAConfig} from 'softkave-forerunner';

const caConfig: CAConfig = {
  outDir: './certs/ca',
  days: 365,
  subject: {
    C: 'US',
    ST: 'California',
    L: 'San Francisco',
    O: 'My Company',
    CN: 'My CA',
  },
  files: {
    key: 'ca.key.pem',
    cert: 'ca.crt.pem',
    csr: 'ca.csr.pem',
    chain: 'ca-chain.pem',
  },
  passphrase: 'optional-passphrase',
};

await generateCA({
  opts: {
    config: './ca-config.json',
    force: false,
    cwd: process.cwd(),
    silent: false,
  },
  logger,
});
```

#### Generate Certificate

```typescript
import {generateCert, CertConfig} from 'softkave-forerunner';

const certConfig: CertConfig = {
  outDir: './certs/server',
  days: 365,
  subject: {
    C: 'US',
    ST: 'California',
    L: 'San Francisco',
    O: 'My Company',
    CN: 'server.example.com',
  },
  san: ['server.example.com', 'localhost', '127.0.0.1'],
  files: {
    key: 'server.key.pem',
    cert: 'server.crt.pem',
    csr: 'server.csr.pem',
    fullchain: 'server-fullchain.pem',
    crtAndKey: 'server.pem',
  },
  ca: {
    dir: './certs/ca',
    passphrase: 'optional-ca-passphrase',
  },
  passphrase: 'optional-passphrase',
};

await generateCert({
  opts: {
    config: './cert-config.json',
    force: false,
    cwd: process.cwd(),
    silent: false,
  },
  logger,
});
```

#### Generate SSH Keypair

```typescript
import {generateSSHKey, SSHKeygenConfig} from 'softkave-forerunner';

const sshConfig: SSHKeygenConfig = {
  algorithm: 'ed25519',
  comment: 'me@laptop',
  passphrase: 'my-passphrase',
  // path can be a directory (defaults filename based on algorithm) or a full filepath
  path: './ssh-keys/',
};

await generateSSHKey({
  config: sshConfig,
  force: false,
  cwd: process.cwd(),
  logger,
});

// Or load from a config filepath:
await generateSSHKey({
  configFilepath: './ssh-key-config.json',
  force: false,
  cwd: process.cwd(),
  logger,
});
```

#### Generate Keyfile

```typescript
import {generateKeyfile, KeyfileConfig} from 'softkave-forerunner';

const keyfileConfig: KeyfileConfig = {
  path: './keyfiles/mongo.keyfile',
  format: 'mongodb',
  // bytes, encoding, mode, newline are optional (reasonable defaults)
};

await generateKeyfile({
  config: keyfileConfig,
  force: false,
  cwd: process.cwd(),
  logger,
});

// Or load from a config filepath:
await generateKeyfile({
  configFilepath: './keyfile-config.json',
  force: false,
  cwd: process.cwd(),
  logger,
});
```
