# CA and Certificates Generator

This module provides a TypeScript-based CLI tool for generating Certificate Authorities (CAs) and signed certificates using OpenSSL. It's designed to be promptless and configurable through JSON files.

## Features

- **Promptless operation** - All operations use configuration files, no interactive prompts
- **JSON configuration** - Easy to configure and version control
- **Zod validation** - Type-safe configuration with runtime validation
- **Force regeneration** - Option to regenerate existing certificates
- **SAN support** - Subject Alternative Names for certificates
- **Passphrase support** - Optional encryption for private keys

## Usage

### Quick Start

1. **Generate a CA:**

   ```bash
   npm run certs:ca -c src/certs/examples/ca-config.json
   ```

2. **Generate a certificate using the CA:**
   ```bash
   npm run certs:cert -c src/certs/examples/cert-config.json
   ```

### Available Commands

- `npm run certs:ca` - Generate a Certificate Authority
- `npm run certs:cert` - Generate a signed certificate using a CA
- `npm run certs:help` - Show detailed help information

### Command Line Options

Both commands support:

- `-c, --config <path>` - Path to configuration JSON file (required)
- `-f, --force` - Force regeneration even if files already exist

## Configuration

### CA Configuration

Create a JSON file with the following structure:

```json
{
  "caName": "fimidara-root-ca",
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
  "passphrase": "optional-passphrase"
}
```

**Fields:**

- `caName`: Name of the CA (used for directory creation)
- `outDir`: Base output directory
- `days`: Validity period in days
- `subject`: X.509 subject fields (C=Country, ST=State, L=Locality, O=Organization, CN=Common Name)
- `files`: Filenames for generated files
- `passphrase`: Optional passphrase for private key encryption

### Certificate Configuration

Create a JSON file with the following structure:

```json
{
  "certName": "fimidara.com",
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
  "passphrase": "optional-passphrase"
}
```

**Additional fields for certificates:**

- `san`: Array of Subject Alternative Names (DNS names or IP addresses)
- `ca`: CA configuration for signing
  - `dir`: Directory containing CA files
  - `passphrase`: CA private key passphrase (if encrypted)

## File Structure

After generation, the following structure is created:

```
certs/
├── fimidara-root-ca/          # CA directory
│   ├── ca.key.pem             # CA private key
│   ├── ca.crt.pem             # CA certificate
│   ├── ca.csr.pem             # CA certificate signing request
│   ├── ca-chain.pem           # CA certificate chain
│   └── openssl.cnf            # Generated OpenSSL config
└── fimidara.com/              # Certificate directory
    ├── fimidara.com.key.pem   # Private key
    ├── fimidara.com.crt.pem   # Certificate
    ├── fimidara.com.csr.pem   # Certificate signing request
    ├── fimidara.com.fullchain.pem # Full certificate chain
    └── openssl.cnf            # Generated OpenSSL config
```

## Examples

### Example 1: Development CA

```json
{
  "caName": "dev-ca",
  "outDir": "./certs",
  "days": 3650,
  "subject": {
    "C": "US",
    "ST": "California",
    "L": "San Francisco",
    "O": "Development Team",
    "CN": "Development CA"
  },
  "files": {
    "key": "ca.key.pem",
    "cert": "ca.crt.pem",
    "csr": "ca.csr.pem",
    "chain": "ca-chain.pem"
  }
}
```

### Example 2: Local Development Certificate

```json
{
  "certName": "localhost",
  "outDir": "./certs",
  "days": 365,
  "subject": {
    "C": "US",
    "ST": "California",
    "L": "San Francisco",
    "O": "Development Team",
    "CN": "localhost"
  },
  "san": ["localhost", "127.0.0.1", "::1"],
  "files": {
    "key": "localhost.key.pem",
    "cert": "localhost.crt.pem",
    "csr": "localhost.csr.pem",
    "fullchain": "localhost.fullchain.pem"
  },
  "ca": {
    "dir": "./certs/dev-ca"
  }
}
```

## Security Notes

- Private keys are generated with 400 permissions (owner read-only)
- CA private keys use 4096-bit RSA keys
- Certificate private keys use 2048-bit RSA keys
- All operations use SHA-256 for hashing
- Passphrases are optional but recommended for production use

## Troubleshooting

### Common Issues

1. **OpenSSL not found**: Ensure OpenSSL is installed and in your PATH
2. **Permission denied**: Check that you have write permissions to the output directory
3. **CA not found**: Ensure the CA directory path in certificate config is correct
4. **Invalid configuration**: Use `npm run certs:help` to see example configurations
