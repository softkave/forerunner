# SDK: Security management

[← SDK](index.md)

#### Generate Password

```typescript
import {generatePassword} from 'softkave-forerunner';

// Generate a single password with default settings
const password = generatePassword();
console.log('Generated password:', password);

// Generate multiple passwords
const passwords = generatePassword({count: 5});
console.log('Generated passwords:', passwords);

// Generate password with custom options
const customPassword = generatePassword({
  length: 16,
  numbers: true,
  symbols: false,
  uppercase: true,
  lowercase: true,
  excludeSimilarCharacters: true,
  strict: true,
});
console.log('Custom password:', customPassword);
```

**Options:**

- `count` (number, optional): Number of passwords to generate (default: 1)
- `length` (number, optional): Password length (default: 32)
- `numbers` (boolean, optional): Include numbers (default: true)
- `symbols` (boolean | string, optional): Include symbols or custom symbol set (default: true)
- `uppercase` (boolean, optional): Include uppercase characters (default: true)
- `lowercase` (boolean, optional): Include lowercase characters (default: true)
- `excludeSimilarCharacters` (boolean, optional): Exclude visually similar characters (default: true)
- `strict` (boolean, optional): Require at least one character from each pool (default: true)
- `exclude` (string, optional): Characters to exclude from password

#### Generate JWT Secret

```typescript
import {generateJwtSecret} from 'softkave-forerunner';

// Generate a single JWT secret
const secret = generateJwtSecret();
console.log('Generated JWT secret:', secret);

// Generate multiple JWT secrets
const secrets = generateJwtSecret(5);
console.log('Generated JWT secrets:', secrets);

// Generate a secret with custom length (e.g. 32 bytes)
const shortSecret = generateJwtSecret(1, 32);
```

**Parameters:**

- `count` (number, optional): Number of secrets to generate (default: 1)
- `length` (number, optional): Length in bytes of each secret (default: 64). Base64 encoding yields ~4/3 this length in characters.

**Returns:**

- Single secret string if `count` is 1 or not provided
- Array of secret strings if `count` > 1

**Note:** Each secret is `length` bytes encoded as base64, suitable for JWT signing. Default 64 bytes yields an 88-character string.
