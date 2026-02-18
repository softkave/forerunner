import {generate} from 'generate-password';
import type {GenerateOptions} from 'generate-password';

export interface GeneratePasswordOptions extends GenerateOptions {
  /**
   * Number of passwords to generate
   * @default 1
   */
  count?: number;
}

/**
 * Generate production-grade password(s) using generate-password library
 * @param options - Password generation options
 * @returns Single password string or array of passwords if count > 1
 */
export function generatePassword(
  options: GeneratePasswordOptions = {}
): string | string[] {
  const {count = 1, ...passwordOptions} = options;

  // Default production-grade settings
  const defaultOptions: GenerateOptions = {
    length: 32,
    numbers: true,
    symbols: true,
    uppercase: true,
    lowercase: true,
    strict: true,
    excludeSimilarCharacters: true,
    ...passwordOptions,
  };

  if (count === 1) {
    return generate(defaultOptions);
  }

  const passwords: string[] = [];
  for (let i = 0; i < count; i++) {
    passwords.push(generate(defaultOptions));
  }
  return passwords;
}
