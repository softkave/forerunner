import {promises as fsp} from 'fs';
import {join} from 'path';
import {fs} from 'zx';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {spawnInherit} from '../utils/spawnInherit.js';
import {
  CertConfig,
  CertConfigSchema,
  GenerateCertsCLIOptions,
} from './types.js';

async function fileExists(path: string): Promise<boolean> {
  try {
    await fsp.access(path);
    return true;
  } catch {
    return false;
  }
}

export class CertGenerator {
  private config: CertConfig;
  private logger: IForeLogger;

  constructor(params: {config: CertConfig; logger: IForeLogger}) {
    this.config = params.config;
    this.logger = params.logger;
  }

  /**
   * Generate certificate if it doesn't exist or if force is true
   */
  async generate(force = false): Promise<void> {
    const certDir = join(this.config.outDir);
    const keyPath = join(certDir, this.config.files.key);
    const certPath = join(certDir, this.config.files.cert);

    if ((await fileExists(keyPath)) && (await fileExists(certPath))) {
      if (force) {
        await Promise.allSettled([fsp.unlink(keyPath), fsp.unlink(certPath)]);
      } else {
        this.logger.log(
          `✅ Certificate already exists at ${certDir}. Use --force to regenerate.`
        );
        return;
      }
    }

    this.logger.log(`🔐 Generating certificate: ${this.config.outDir}`);

    // Create output directory
    await fsp.mkdir(certDir, {recursive: true});

    // Generate OpenSSL configuration with SAN
    const opensslConfig = this.generateOpenSSLConfig();
    const configPath = join(certDir, `openssl-${this.config.files.key}.cnf`);
    await fsp.writeFile(configPath, opensslConfig);

    try {
      // Generate private key
      this.logger.log('  Generating private key...');
      const genrsaArgs = this.config.passphrase
        ? [
            'genrsa',
            '-aes256',
            '-passout',
            `pass:${this.config.passphrase}`,
            '-out',
            keyPath,
            '2048',
          ]
        : ['genrsa', '-out', keyPath, '2048'];
      await spawnInherit('openssl', genrsaArgs);

      // Generate CSR
      this.logger.log('  Generating CSR...');
      const csrPath = join(certDir, this.config.files.csr);
      const csrArgs = this.config.passphrase
        ? [
            'req',
            '-new',
            '-key',
            keyPath,
            '-passin',
            `pass:${this.config.passphrase}`,
            '-out',
            csrPath,
            '-config',
            configPath,
          ]
        : [
            'req',
            '-new',
            '-key',
            keyPath,
            '-out',
            csrPath,
            '-config',
            configPath,
          ];
      await spawnInherit('openssl', csrArgs);

      // Sign certificate with CA
      this.logger.log('  Signing certificate with CA...');
      const caKeyPath = join(this.config.ca.dir, 'ca.key.pem');
      const caCertPath = join(this.config.ca.dir, 'ca.crt.pem');

      if (!(await fileExists(caKeyPath)) || !(await fileExists(caCertPath))) {
        throw new Error(`CA files not found at ${this.config.ca.dir}`);
      }

      const signArgsBase = [
        'x509',
        '-req',
        '-in',
        csrPath,
        '-CA',
        caCertPath,
        '-CAkey',
        caKeyPath,
        ...(this.config.ca.passphrase
          ? ['-passin', `pass:${this.config.ca.passphrase}`]
          : []),
        '-CAcreateserial',
        '-out',
        certPath,
        '-days',
        String(this.config.days),
        '-sha256',
        '-extfile',
        configPath,
        '-extensions',
        'req_ext',
      ];
      await spawnInherit('openssl', signArgsBase);

      // Create full chain
      this.logger.log('  Creating full chain...');
      const fullchainPath = join(certDir, this.config.files.fullchain);
      const caChainPath = join(this.config.ca.dir, 'ca-chain.pem');

      {
        const certPem = await fsp.readFile(certPath, 'utf8');
        const chainPem = (await fileExists(caChainPath))
          ? await fsp.readFile(caChainPath, 'utf8')
          : await fsp.readFile(caCertPath, 'utf8');
        await fsp.writeFile(fullchainPath, certPem);
        await fsp.appendFile(fullchainPath, chainPem);
      }

      if (this.config.files.crtAndKey) {
        this.logger.log('  Creating CRT and key...');
        const crtAndKeyPath = join(certDir, this.config.files.crtAndKey);
        const certPem = await fsp.readFile(certPath, 'utf8');
        const keyPem = await fsp.readFile(keyPath, 'utf8');
        await fsp.writeFile(crtAndKeyPath, certPem);
        await fsp.appendFile(crtAndKeyPath, keyPem);
      }

      this.logger.log(`✅ Certificate generated successfully at ${certDir}`);
    } catch (error) {
      this.logger.error('❌ Error generating certificate:', error);
      throw error;
    }
  }

  /**
   * Generate OpenSSL configuration for certificate with SAN
   */
  private generateOpenSSLConfig(): string {
    const {subject, san} = this.config;

    let config = `[ req ]
default_bits = 2048
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = req_distinguished_name

[ req_distinguished_name ]
C = ${subject.C}
ST = ${subject.ST}
L = ${subject.L}
O = ${subject.O}
CN = ${subject.CN}

[ req_ext ]
subjectAltName = @alt_names

[ alt_names ]
`;

    // Add SAN entries
    san.forEach((sanEntry, index) => {
      const i = index + 1;
      if (this.isIPAddress(sanEntry)) {
        config += `IP.${i} = ${sanEntry}\n`;
      } else {
        config += `DNS.${i} = ${sanEntry}\n`;
      }
    });

    return config;
  }

  /**
   * Check if string is an IP address
   */
  private isIPAddress(str: string): boolean {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(str)) return false;

    const parts = str.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  /**
   * Get certificate path
   */
  getCertPath(): string {
    return join(this.config.outDir, this.config.files.cert);
  }

  /**
   * Get key path
   */
  getKeyPath(): string {
    return join(this.config.outDir, this.config.files.key);
  }

  /**
   * Get full chain path
   */
  getFullchainPath(): string {
    return join(this.config.outDir, this.config.files.fullchain);
  }
}

export async function generateCert(params: {
  opts: GenerateCertsCLIOptions;
  logger: IForeLogger;
}) {
  // Read and parse config file
  if (params.opts.cwd) {
    process.chdir(params.opts.cwd);
  }
  const configContent = await fs.promises.readFile(params.opts.config, 'utf-8');
  const config = CertConfigSchema.parse(JSON.parse(configContent));

  // Generate certificate
  const certGenerator = new CertGenerator({config, logger: params.logger});
  await certGenerator.generate(params.opts.force);

  params.logger.log('✅ Certificate generation completed successfully');
}
