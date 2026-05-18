# Certificate configuration

[← Configuration](index.md)

Certificate generation requires JSON configuration files for both Certificate Authority (CA) and end-entity certificates. Below are detailed explanations for each configuration option:

#### CA Configuration Options

**`outDir`** (string, required)

- **Description**: Output directory where CA files will be generated
- **Example**: `"./certs"`
- **Note**: Directory will be created if it doesn't exist

**`days`** (number, required)

- **Description**: Certificate validity period in days
- **Example**: `3650` (10 years)
- **Note**: Must be a positive integer

**`subject`** (object, required)

- **Description**: X.509 certificate subject information for the CA
- **Properties**:
  - `C` (string): Country code (2 characters, e.g., "US")
  - `ST` (string): State or province name
  - `L` (string): Locality or city name
  - `O` (string): Organization name
  - `CN` (string): Common name for the CA

**`files`** (object, optional)

- **Description**: Custom filenames for generated CA files
- **Properties**:
  - `key` (string): Private key filename (default: "ca.key.pem")
  - `cert` (string): Certificate filename (default: "ca.crt.pem")
  - `csr` (string): Certificate Signing Request filename (default: "ca.csr.pem")
  - `chain` (string): Certificate chain filename (default: "ca-chain.pem")
- **Default**: Uses standard filenames if not specified

**`passphrase`** (string, optional)

- **Description**: Passphrase to protect the CA private key
- **Example**: `"ca-passphrase"`
- **Note**: If provided, the private key will be encrypted

#### Certificate Configuration Options

**`outDir`** (string, required)

- **Description**: Output directory where certificate files will be generated
- **Example**: `"./certs"`
- **Note**: Directory will be created if it doesn't exist

**`days`** (number, required)

- **Description**: Certificate validity period in days
- **Example**: `825` (approximately 2.25 years)
- **Note**: Must be a positive integer

**`subject`** (object, required)

- **Description**: X.509 certificate subject information for the end-entity certificate
- **Properties**:
  - `C` (string): Country code (2 characters, e.g., "US")
  - `ST` (string): State or province name
  - `L` (string): Locality or city name
  - `O` (string): Organization name
  - `CN` (string): Common name (typically the primary domain name)

**`san`** (array, required)

- **Description**: Subject Alternative Names (SAN) for the certificate
- **Example**: `["fimidara.com", "www.fimidara.com", "127.0.0.1"]`
- **Note**: Must include at least one SAN entry

**`files`** (object, required)

- **Description**: Filenames for generated certificate files
- **Properties**:
  - `key` (string): Private key filename
  - `cert` (string): Certificate filename
  - `csr` (string): Certificate Signing Request filename
  - `fullchain` (string): Full certificate chain filename (cert + CA chain)
  - `crtAndKey` (string, optional): Combined certificate and key filename

**`ca`** (object, required)

- **Description**: Certificate Authority configuration for signing
- **Properties**:
  - `dir` (string): Directory containing the CA files
  - `passphrase` (string, optional): CA private key passphrase

**`passphrase`** (string, optional)

- **Description**: Passphrase to protect the certificate private key
- **Example**: `"cert-passphrase"`
- **Note**: If provided, the private key will be encrypted

**Example CA Configuration** (`src/certs/examples/ca-config.json`):

```json
{
  "outDir": "./certs",
  "days": 3650,
  "subject": {
    "C": "US",
    "ST": "Delaware",
    "L": "Dover",
    "O": "fimidara",
    "CN": "fimidara Root CA"
  },
  "files": {
    "key": "ca.key.pem",
    "cert": "ca.crt.pem",
    "csr": "ca.csr.pem",
    "chain": "ca-chain.pem"
  },
  "passphrase": "ca-passphrase"
}
```

**Example Certificate Configuration** (`src/certs/examples/cert-config.json`):

```json
{
  "outDir": "./certs",
  "days": 825,
  "subject": {
    "C": "US",
    "ST": "Delaware",
    "L": "Dover",
    "O": "fimidara",
    "CN": "fimidara.com"
  },
  "san": ["fimidara.com", "www.fimidara.com", "127.0.0.1"],
  "files": {
    "key": "fimidara.com.key.pem",
    "cert": "fimidara.com.crt.pem",
    "csr": "fimidara.com.csr.pem",
    "fullchain": "fimidara.com.fullchain.pem"
  },
  "ca": {
    "dir": "./certs/fimidara-root-ca",
    "passphrase": "ca-passphrase"
  },
  "passphrase": "cert-passphrase"
}
```
