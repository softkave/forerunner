# Keyfile configuration

[← Configuration](index.md)

Keyfile generation supports a JSON configuration file (used by `certs keyfile --config <path>` and by the SDK via `configFilepath`).

**Options:**

- **`path`** (string, required): output filepath for the keyfile
- **`format`** (`"mongodb" | "generic"`, optional): default `"mongodb"`
- **`bytes`** (number, optional): random bytes before encoding (default: 756 for mongodb, 32 for generic). Note: base64 increases length by ~33%, so 756 bytes becomes 1008 chars (plus optional newline), staying under the 1024-char limit.
- **`encoding`** (`"base64" | "hex"`, optional): default `"base64"` (mongodb requires base64)
- **`mode`** (number, optional): chmod mode (default `400` / `0o400`)
- **`newline`** (boolean, optional): append trailing newline (default: true)

**Example keyfile configuration** (`keyfile-config.json`):

```json
{
  "path": "./keyfiles/mongo.keyfile",
  "format": "mongodb",
  "bytes": 756,
  "encoding": "base64",
  "mode": 400,
  "newline": true
}
```
