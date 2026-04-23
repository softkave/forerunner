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

/** Schema for `SSHKeygenConfig` (used by `certs ssh-key`). */
export const SSHKeygenConfigSchema: z.ZodType<SSHKeygenConfig> = z.object({
  algorithm: z.enum(['ed25519', 'rsa', 'ecdsa']).optional().default('ed25519'),
  bits: z.number().int().positive().optional(),
  comment: z.string().min(1).optional(),
  passphrase: z.string().min(1).optional(),
  path: z.string().min(1, 'Path is required'),
});

/** CA configuration used by `certs ca` and certificate generation. */
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

/** Parsed/validated CA config produced by `CAConfigSchema.parse(...)`. */
export type CAConfigSchemaType = CAConfig;

/** End-entity certificate config used by `certs cert` and DB cert generation. */
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

/** CLI options for `certs ca` / `certs cert`. */
export const GenerateCertsCLIOptionsSchema = z.object({
  force: z.boolean().optional(),
  config: z.string().min(1, 'Config file path is required'),
  cwd: z.string().optional(),
  silent: z.boolean().optional(),
});

/** CLI options for `certs ssh-key`. */
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
  /** Output directory where CA files are generated. */
  outDir: string;
  /** Certificate validity in days. */
  days: number;
  /** X.509 subject fields. */
  subject: {
    /** Country code (2 chars). */
    C: string;
    /** State/province. */
    ST: string;
    /** Locality/city. */
    L: string;
    /** Organization. */
    O: string;
    /** Common name. */
    CN: string;
  };
  /** Output filenames for CA artifacts. */
  files: {
    /** CA private key filename. */
    key: string;
    /** CA certificate filename. */
    cert: string;
    /** CA CSR filename. */
    csr: string;
    /** CA chain filename. */
    chain: string;
  };
  /** Optional passphrase used to encrypt the CA private key. */
  passphrase?: string;
}

export interface CertConfig {
  /** Output directory where cert files are generated. */
  outDir: string;
  /** Certificate validity in days. */
  days: number;
  /** X.509 subject fields. */
  subject: {
    /** Country code (2 chars). */
    C: string;
    /** State/province. */
    ST: string;
    /** Locality/city. */
    L: string;
    /** Organization. */
    O: string;
    /** Common name. */
    CN: string;
  };
  /** Subject alternative names (DNS/IP). */
  san: string[];
  /** Output filenames for cert artifacts. */
  files: {
    /** Private key filename. */
    key: string;
    /** Certificate filename. */
    cert: string;
    /** CSR filename. */
    csr: string;
    /** Full chain filename (cert + CA chain). */
    fullchain: string;
    /** Optional combined cert+key filename. */
    crtAndKey?: string;
  };
  /** CA directory and optional passphrase for signing. */
  ca: {
    /** Directory containing CA files (key/cert/chain). */
    dir: string;
    /** Optional CA private key passphrase. */
    passphrase?: string;
  };
  /** Optional passphrase used to encrypt the certificate private key. */
  passphrase?: string;
}

/** CLI options accepted by `certs ca` / `certs cert`. */
export interface GenerateCertsCLIOptions {
  /** Force regeneration even if outputs already exist. */
  force?: boolean;
  /** Path to config JSON file. */
  config: string;
  /** Working directory (used to resolve relative paths). */
  cwd?: string;
  /** Suppress non-essential output. */
  silent?: boolean;
}

/** CLI options accepted by `certs ssh-key`. */
export interface GenerateSSHKeyCLIOptions {
  /** Force regeneration even if key already exists. */
  force?: boolean;
  /** Optional config filepath (when provided, flags are optional). */
  config?: string;
  /** Working directory (used to resolve relative paths). */
  cwd?: string;
  /** Suppress non-essential output. */
  silent?: boolean;

  /** Key algorithm (flags mode). */
  algorithm?: 'ed25519' | 'rsa' | 'ecdsa';
  /** Key size (RSA/ECDSA; ignored for ed25519). */
  bits?: number;
  /** Public key comment (`ssh-keygen -C`). */
  comment?: string;
  /** Passphrase (`ssh-keygen -N`). */
  passphrase?: string;
  /** Output directory (ends with `/`) or full filepath. */
  path: string;
}
