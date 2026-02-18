import {randomBytes} from 'crypto';

/**
 * Generate production-grade JWT secret(s)
 * @param count - Number of secrets to generate (default: 1)
 * @param length - Length in bytes of each secret (default: 64). Base64 encoding yields ~4/3 this length in characters.
 * @returns Single secret string or array of secrets if count > 1
 */
export function generateJwtSecret(
  count: number = 1,
  length: number = 64
): string | string[] {
  const generateOne = (): string => {
    return randomBytes(length).toString('base64');
  };

  if (count === 1) {
    return generateOne();
  }

  const secrets: string[] = [];
  for (let i = 0; i < count; i++) {
    secrets.push(generateOne());
  }
  return secrets;
}
