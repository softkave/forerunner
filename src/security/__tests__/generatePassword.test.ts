import {describe, expect, test} from 'vitest';
import {generatePassword} from '../generatePassword.js';

describe('generatePassword', () => {
  test('should generate a single password by default', () => {
    const password = generatePassword();
    expect(typeof password).toBe('string');
    expect(password.length).toBeGreaterThan(0);
  });

  test('should generate password with default production-grade settings', () => {
    const password = generatePassword();
    expect(typeof password).toBe('string');
    // Default length is 32
    expect(password.length).toBe(32);
    // Should contain uppercase, lowercase, numbers, and symbols
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[^A-Za-z0-9]/);
  });

  test('should generate multiple passwords when count > 1', () => {
    const passwords = generatePassword({count: 5});
    expect(Array.isArray(passwords)).toBe(true);
    expect(passwords.length).toBe(5);
    (passwords as string[]).forEach(pwd => {
      expect(typeof pwd).toBe('string');
      expect(pwd.length).toBe(32);
    });
    // All passwords should be different
    const uniquePasswords = new Set(passwords);
    expect(uniquePasswords.size).toBe(5);
  });

  test('should respect custom length', () => {
    const password = generatePassword({length: 16});
    expect(password.length).toBe(16);
  });

  test('should respect custom options', () => {
    const password = generatePassword({
      length: 20,
      numbers: false,
      symbols: false,
      uppercase: true,
      lowercase: true,
    });
    expect(password.length).toBe(20);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).not.toMatch(/[0-9]/);
    // Should not contain symbols (only letters)
    expect(password).toMatch(/^[A-Za-z]+$/);
  });

  test('should work with excludeSimilarCharacters', () => {
    const password = generatePassword({
      excludeSimilarCharacters: true,
      length: 50,
    });
    // Should not contain similar characters like i, l, 1, L, o, 0, O
    expect(password).not.toMatch(/[il1Lo0O]/);
  });

  test('should work with exclude option', () => {
    const password = generatePassword({
      exclude: 'aA',
      length: 50,
    });
    expect(password).not.toMatch(/[aA]/);
  });

  test('should work with strict mode', () => {
    const password = generatePassword({
      strict: true,
      length: 32,
      numbers: true,
      symbols: true,
      uppercase: true,
      lowercase: true,
    });
    // Strict mode ensures at least one character from each pool
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[^A-Za-z0-9]/);
  });

  test('should generate different passwords on each call', () => {
    const password1 = generatePassword();
    const password2 = generatePassword();
    expect(password1).not.toBe(password2);
  });

  test('should handle count = 1 explicitly', () => {
    const password = generatePassword({count: 1});
    expect(typeof password).toBe('string');
    expect(Array.isArray(password)).toBe(false);
  });

  test('should handle custom symbols string', () => {
    const password = generatePassword({
      symbols: '!@#$',
      length: 50,
    });
    // Should only contain the specified symbols
    const symbolMatches = (password as string).match(/[!@#$]/g);
    expect(symbolMatches).toBeTruthy();
    // Should not contain other symbols
    const otherSymbols = (password as string).match(/[^A-Za-z0-9!@#$]/g);
    expect(otherSymbols).toBeNull();
  });
});
