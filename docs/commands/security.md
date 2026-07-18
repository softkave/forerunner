# Security (`security`)

[← Commands](index.md)

## Commands

- [`password`](#generate-password) — Generate production-grade password(s)
- [`jwt-secret`](#generate-jwt-secret) — Generate production-grade JWT secret(s)

Security utilities for generating production-grade passwords and JWT secrets.

#### Generate Password

```bash
softkave-forerunner security password [options]
```

**Description**: Generates production-grade password(s) using cryptographically secure random generation. By default, generates passwords with uppercase, lowercase, numbers, symbols, and excludes visually similar characters.

**Options:**

- `-c, --count <number>` - Number of passwords to generate (default: 1)
- `-l, --length <number>` - Password length (default: 32)
- `--numbers` / `--no-numbers` - Include/exclude numbers (default: include)
- `--symbols` / `--no-symbols` - Include/exclude symbols (default: include)
- `--uppercase` / `--no-uppercase` - Include/exclude uppercase characters (default: include)
- `--lowercase` / `--no-lowercase` - Include/exclude lowercase characters (default: include)
- `--exclude-similar` / `--no-exclude-similar` - Exclude/allow visually similar characters like 'i' and 'I' (default: exclude)
- `--strict` / `--no-strict` - Require at least one character from each enabled pool (default: require)
- `--exclude <chars>` - Characters to exclude from password (default: "")
- `--symbols-set <chars>` - Custom symbols to use instead of default symbols (default: "")
- `-s, --silent` - Silent mode

**Examples:**

```bash
# Generate a single password with default settings
softkave-forerunner security password

# Generate 5 passwords
softkave-forerunner security password --count 5

# Generate a 16-character password without symbols
softkave-forerunner security password --length 16 --no-symbols

# Generate a password with custom symbols only
softkave-forerunner security password --symbols-set "!@#$%"

# Generate a password excluding certain characters
softkave-forerunner security password --exclude "0O1lIi"
```

#### Generate JWT Secret

```bash
softkave-forerunner security jwt-secret [options]
```

**Description**: Generates production-grade JWT secret(s) using cryptographically secure random bytes. Each secret is `length` bytes (default 64) encoded as base64, suitable for JWT signing.

**Options:**

- `-c, --count <number>` - Number of secrets to generate (default: 1)
- `-l, --length <number>` - Length in bytes of each secret (default: 64)
- `-s, --silent` - Silent mode

**Examples:**

```bash
# Generate a single JWT secret (64 bytes, default)
softkave-forerunner security jwt-secret

# Generate 3 JWT secrets
softkave-forerunner security jwt-secret --count 3

# Generate a JWT secret with custom length (e.g. 32 bytes)
softkave-forerunner security jwt-secret --length 32
```
