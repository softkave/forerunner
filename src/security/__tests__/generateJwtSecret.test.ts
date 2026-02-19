import {describe, expect, test} from 'vitest';
import {generateJwtSecret} from '../generateJwtSecret.js';

describe('generateJwtSecret', () => {
  test('should generate a single secret by default', () => {
    const secret = generateJwtSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(0);
  });

  test('should generate base64 encoded secret', () => {
    const secret = generateJwtSecret();
    // Base64 encoded 64 bytes = 88 characters (64 * 4/3 = 85.33, rounded up)
    expect(secret.length).toBe(88);
    // Should be valid base64
    expect(secret).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  test('should generate multiple secrets when count > 1', () => {
    const secrets = generateJwtSecret(5);
    expect(Array.isArray(secrets)).toBe(true);
    expect(secrets.length).toBe(5);
    (secrets as string[]).forEach(secret => {
      expect(typeof secret).toBe('string');
      expect(secret.length).toBe(88);
    });
    // All secrets should be different
    const uniqueSecrets = new Set(secrets);
    expect(uniqueSecrets.size).toBe(5);
  });

  test('should generate different secrets on each call', () => {
    const secret1 = generateJwtSecret();
    const secret2 = generateJwtSecret();
    expect(secret1).not.toBe(secret2);
  });

  test('should handle count = 1 explicitly', () => {
    const secret = generateJwtSecret(1);
    expect(typeof secret).toBe('string');
    expect(Array.isArray(secret)).toBe(false);
  });

  test('should generate cryptographically secure secrets', () => {
    // Generate 100 secrets and check they're all unique
    const secrets = generateJwtSecret(100);
    const uniqueSecrets = new Set(secrets);
    expect(uniqueSecrets.size).toBe(100);
  });

  test('should generate secrets of consistent length', () => {
    const secrets = generateJwtSecret(10);
    (secrets as string[]).forEach(secret => {
      expect(secret.length).toBe(88);
    });
  });

  test('should respect custom length parameter', () => {
    // 32 bytes -> base64 length ceil(32 * 4/3) = 44
    const secret = generateJwtSecret(1, 32);
    expect(typeof secret).toBe('string');
    expect(secret.length).toBe(44);
    expect(secret).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  test('should use default length 64 when only count provided', () => {
    const secret = generateJwtSecret(1);
    expect(secret.length).toBe(88);
  });
});
