import {z} from 'zod';

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
export const CLIOptionsSchema = z.object({
  force: z.boolean().optional(),
  config: z.string().min(1, 'Config file path is required'),
  cwd: z.string().optional(),
  silent: z.boolean().optional(),
});

export type CAConfig = z.infer<typeof CAConfigSchema>;
export type CertConfig = z.infer<typeof CertConfigSchema>;
export type CLIOptions = z.infer<typeof CLIOptionsSchema>;
