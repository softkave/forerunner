# SSH key configuration

[← Configuration](index.md)

SSH key generation supports a JSON configuration file (used by `certs ssh-key --config <path>` and by the SDK via `configFilepath`).

**Options:**

- **`algorithm`** (`"ed25519" | "rsa" | "ecdsa"`, optional): default `"ed25519"`
- **`bits`** (number, optional): ignored for ed25519; recommended defaults are RSA `4096`, ECDSA `521`
- **`comment`** (string, required): passed to `ssh-keygen -C`
- **`passphrase`** (string, required): passed to `ssh-keygen -N`
- **`path`** (string, optional): directory (ends with `/`) or filepath for private key (default: `"./ssh-keys/"`)

**Example SSH key configuration** (`ssh-key-config.json`):

```json
{
  "algorithm": "ed25519",
  "comment": "me@laptop",
  "passphrase": "my-passphrase",
  "path": "./ssh-keys/"
}
```
