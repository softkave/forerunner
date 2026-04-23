import {z} from 'zod';

/**
 * SSH key generation config used by `ssh-keygen`.
 */
export interface SSHKeygenConfig {
  /**
   * Key algorithm.
   *
   * Recommended default: `ed25519`.
   */
  algorithm?: 'ed25519' | 'rsa' | 'ecdsa';

  /**
   * Key size in bits.
   *
   * - For `ed25519`, this is ignored.
   * - For `rsa`, recommended default is `4096`.
   * - For `ecdsa`, common values are `256`, `384`, `521` (recommended default:
   *   `521`).
   */
  bits?: number;

  /**
   * Key comment shown in the public key (e.g. `user@laptop` or `service-name`).
   */
  comment?: string;

  /**
   * Passphrase used to encrypt the private key.
   */
  passphrase?: string;

  /**
   * Output path for the private key.
   *
   * Can be either:
   * - A directory path (e.g. `./ssh-keys/`) — filename will default to
   *   `id_ed25519` / `id_rsa` / `id_ecdsa`
   * - A full filepath (e.g. `./ssh-keys/deploy_key`)
   */
  path: string;
}

export const SSHKeygenConfigSchema: z.ZodType<SSHKeygenConfig> = z.object({
  algorithm: z.enum(['ed25519', 'rsa', 'ecdsa']).optional().default('ed25519'),
  bits: z.number().int().positive().optional(),
  comment: z.string().min(1).optional(),
  passphrase: z.string().min(1).optional(),
  path: z.string().min(1, 'Path is required'),
});

// CA configuration schema
export const CAConfigSchema = z.object({
  outDir: z.string().min(1, 'Output directory is required'),
  days: z.number().int().positive('Days must be a positive integer'),
  subject: z.object({
    C: z.string().length(2, 'Country code must be 2 characters'),
    ST: z.string().min(1, 'State is required'),
    L: z.string().min(1, 'Locality is required'),
    O: z.string().min(1, 'Organization is required'),
    CN: z.string().min(1, 'Common Name is required'),
  }),
  files: z
    .object({
      key: z.string().min(1, 'Key filename is required').default('ca.key.pem'),
      cert: z
        .string()
        .min(1, 'Certificate filename is required')
        .default('ca.crt.pem'),
      csr: z.string().min(1, 'CSR filename is required').default('ca.csr.pem'),
      chain: z
        .string()
        .min(1, 'Chain filename is required')
        .default('ca-chain.pem'),
    })
    .default({
      key: 'ca.key.pem',
      cert: 'ca.crt.pem',
      csr: 'ca.csr.pem',
      chain: 'ca-chain.pem',
    }),
  passphrase: z.string().optional(),
});

// Certificate configuration schema
export const CertConfigSchema = z.object({
  outDir: z.string().min(1, 'Output directory is required'),
  days: z.number().int().positive('Days must be a positive integer'),
  subject: z.object({
    C: z.string().length(2, 'Country code must be 2 characters'),
    ST: z.string().min(1, 'State is required'),
    L: z.string().min(1, 'Locality is required'),
    O: z.string().min(1, 'Organization is required'),
    CN: z.string().min(1, 'Common Name is required'),
  }),
  san: z.array(z.string()).min(1, 'At least one SAN is required'),
  files: z.object({
    key: z.string().min(1, 'Key filename is required'),
    cert: z.string().min(1, 'Certificate filename is required'),
    csr: z.string().min(1, 'CSR filename is required'),
    fullchain: z.string().min(1, 'Full chain filename is required'),
    crtAndKey: z
      .string()
      .min(1, 'Certificate and key filename is required')
      .optional(),
  }),
  ca: z.object({
    dir: z.string().min(1, 'CA directory is required'),
    passphrase: z.string().optional(),
  }),
  passphrase: z.string().optional(),
});

// CLI options schema
export const GenerateCertsCLIOptionsSchema = z.object({
  force: z.boolean().optional(),
  config: z.string().min(1, 'Config file path is required'),
  cwd: z.string().optional(),
  silent: z.boolean().optional(),
});

export const GenerateSSHKeyCLIOptionsSchema = z.object({
  force: z.boolean().optional(),
  config: z.string().min(1).optional(),
  cwd: z.string().optional(),
  silent: z.boolean().optional(),

  algorithm: z.enum(['ed25519', 'rsa', 'ecdsa']).optional(),
  bits: z.number().int().positive().optional(),
  comment: z.string().min(1).optional(),
  passphrase: z.string().min(1).optional(),
  path: z.string().min(1, 'Path is required'),
});

export interface CAConfig {
  outDir: string;
  days: number;
  subject: {
    C: string;
    ST: string;
    L: string;
    O: string;
    CN: string;
  };
  files: {
    key: string;
    cert: string;
    csr: string;
    chain: string;
  };
  passphrase?: string;
}

export interface CertConfig {
  outDir: string;
  days: number;
  subject: {
    C: string;
    ST: string;
    L: string;
    O: string;
    CN: string;
  };
  san: string[];
  files: {
    key: string;
    cert: string;
    csr: string;
    fullchain: string;
    crtAndKey?: string;
  };
  ca: {
    dir: string;
    passphrase?: string;
  };
  passphrase?: string;
}

export type GenerateCertsCLIOptions = z.infer<
  typeof GenerateCertsCLIOptionsSchema
>;

export type GenerateSSHKeyCLIOptions = z.infer<
  typeof GenerateSSHKeyCLIOptionsSchema
>;
