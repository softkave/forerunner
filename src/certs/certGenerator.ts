import {promises as fsp} from 'fs';
import {join} from 'path';
import {fs} from 'zx';
import {fileExists} from '../utils/file.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {resolvePathUnderWorkingDir} from '../utils/resolvePathUnderWorkingDir.js';
import {spawnInherit} from '../utils/spawnInherit.js';
import {
  CertConfig,
  CertConfigSchema,
  GenerateCertsCLIOptions,
} from './types.js';

export class CertGenerator {
  private config: CertConfig;
  private logger: IForeLogger;
  private cwd?: string;

  constructor(params: {config: CertConfig; logger: IForeLogger; cwd?: string}) {
    this.config = params.config;
    this.logger = params.logger;
    this.cwd = params.cwd;
  }

  /**
   * Generate certificate if it doesn't exist or if force is true
   */
  async generate(force = false): Promise<void> {
    let certDir = this.config.outDir;
    let keyPath = join(certDir, this.config.files.key);
    let certPath = join(certDir, this.config.files.cert);
    if (this.cwd) {
      certDir = resolvePathUnderWorkingDir(this.cwd, certDir);
      keyPath = resolvePathUnderWorkingDir(this.cwd, keyPath);
      certPath = resolvePathUnderWorkingDir(this.cwd, certPath);
    }

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
    let configPath = join(certDir, `openssl-${this.config.files.key}.cnf`);
    if (this.cwd) {
      configPath = resolvePathUnderWorkingDir(this.cwd, configPath);
    }
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
      await fsp.chmod(keyPath, 0o600);

      // Generate CSR
      this.logger.log('  Generating CSR...');
      let csrPath = join(certDir, this.config.files.csr);
      if (this.cwd) {
        csrPath = resolvePathUnderWorkingDir(this.cwd, csrPath);
      }
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
      let caKeyPath = join(this.config.ca.dir, 'ca.key.pem');
      let caCertPath = join(this.config.ca.dir, 'ca.crt.pem');
      if (this.cwd) {
        caKeyPath = resolvePathUnderWorkingDir(this.cwd, caKeyPath);
        caCertPath = resolvePathUnderWorkingDir(this.cwd, caCertPath);
      }

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
      let fullchainPath = join(certDir, this.config.files.fullchain);
      let caChainPath = join(this.config.ca.dir, 'ca-chain.pem');
      if (this.cwd) {
        fullchainPath = resolvePathUnderWorkingDir(this.cwd, fullchainPath);
        caChainPath = resolvePathUnderWorkingDir(this.cwd, caChainPath);
      }

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
        let crtAndKeyPath = join(certDir, this.config.files.crtAndKey);
        if (this.cwd) {
          crtAndKeyPath = resolvePathUnderWorkingDir(this.cwd, crtAndKeyPath);
        }
        const certPem = await fsp.readFile(certPath, 'utf8');
        const keyPem = await fsp.readFile(keyPath, 'utf8');
        await fsp.writeFile(crtAndKeyPath, certPem + keyPem);
        await fsp.chmod(crtAndKeyPath, 0o600);
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
    let certPath = join(this.config.outDir, this.config.files.cert);
    if (this.cwd) {
      certPath = resolvePathUnderWorkingDir(this.cwd, certPath);
    }
    return certPath;
  }

  /**
   * Get key path
   */
  getKeyPath(): string {
    let keyPath = join(this.config.outDir, this.config.files.key);
    if (this.cwd) {
      keyPath = resolvePathUnderWorkingDir(this.cwd, keyPath);
    }
    return keyPath;
  }

  /**
   * Get full chain path
   */
  getFullchainPath(): string {
    let fullchainPath = join(this.config.outDir, this.config.files.fullchain);
    if (this.cwd) {
      fullchainPath = resolvePathUnderWorkingDir(this.cwd, fullchainPath);
    }
    return fullchainPath;
  }
}

export async function generateCert(params: {
  opts: GenerateCertsCLIOptions;
  logger: IForeLogger;
}) {
  // Read and parse config file
  const configPath = params.opts.cwd
    ? resolvePathUnderWorkingDir(params.opts.cwd, params.opts.config)
    : params.opts.config;
  const configContent = await fs.promises.readFile(configPath, 'utf-8');
  const config = CertConfigSchema.parse(JSON.parse(configContent));

  // Generate certificate
  const certGenerator = new CertGenerator({
    config,
    logger: params.logger,
    cwd: params.opts.cwd,
  });
  await certGenerator.generate(params.opts.force);

  params.logger.log('✅ Certificate generation completed successfully');
}
