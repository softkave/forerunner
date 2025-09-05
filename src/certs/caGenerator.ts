import {execSync} from 'child_process';
import {existsSync, mkdirSync, unlinkSync, writeFileSync} from 'fs';
import {join} from 'path';
import {ForeLogger, IForeLogger} from '../utils/foreLogger.js';
import {CAConfig} from './types.js';

export class CAGenerator {
  private config: CAConfig;
  private logger: IForeLogger;

  constructor(config: CAConfig, silent?: boolean) {
    this.config = config;
    this.logger = new ForeLogger({silent});
  }

  /**
   * Generate CA if it doesn't exist or if force is true
   */
  async generate(force = false): Promise<void> {
    const caDir = join(this.config.outDir);
    const keyPath = join(caDir, this.config.files.key);
    const certPath = join(caDir, this.config.files.cert);

    if (existsSync(keyPath) && existsSync(certPath)) {
      if (force) {
        unlinkSync(keyPath);
        unlinkSync(certPath);
      } else {
        this.logger.log(
          `✅ CA already exists at ${caDir}. Use --force to regenerate.`
        );
        return;
      }
    }

    this.logger.log(`🔑 Generating CA: ${this.config.outDir}`);

    // Create output directory
    mkdirSync(caDir, {recursive: true});

    // Generate OpenSSL configuration
    const opensslConfig = this.generateOpenSSLConfig();
    const configPath = join(caDir, 'openssl.cnf');
    writeFileSync(configPath, opensslConfig);

    try {
      // Generate private key
      this.logger.log('  Generating private key...');
      const keyCmd = this.config.passphrase
        ? `openssl genrsa -aes256 -passout pass:'${this.config.passphrase}' -out "${keyPath}" 4096`
        : `openssl genrsa -out "${keyPath}" 4096`;

      execSync(keyCmd, {stdio: 'inherit'});

      // Set proper permissions
      execSync(`chmod 400 "${keyPath}"`, {stdio: 'inherit'});

      // Generate certificate
      this.logger.log('  Generating certificate...');
      const certCmd = this.config.passphrase
        ? `openssl req -new -x509 -key "${keyPath}" -passin pass:'${this.config.passphrase}' -out "${certPath}" -days ${this.config.days} -config "${configPath}"`
        : `openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days ${this.config.days} -config "${configPath}"`;

      execSync(certCmd, {stdio: 'inherit'});

      this.logger.log(`✅ CA generated successfully at ${caDir}`);
    } catch (error) {
      this.logger.error('❌ Error generating CA:', error);
      throw error;
    }
  }

  /**
   * Generate OpenSSL configuration for CA
   */
  private generateOpenSSLConfig(): string {
    const {subject} = this.config;

    return `[ req ]
default_bits = 4096
prompt = no
default_md = sha256
x509_extensions = v3_ca
distinguished_name = req_distinguished_name

[ req_distinguished_name ]
C = ${subject.C}
ST = ${subject.ST}
L = ${subject.L}
O = ${subject.O}
CN = ${subject.CN}

[ v3_ca ]
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
basicConstraints = critical, CA:true
keyUsage = critical, digitalSignature, cRLSign, keyCertSign
`;
  }

  /**
   * Get CA certificate path
   */
  getCertPath(): string {
    return join(this.config.outDir, this.config.files.cert);
  }

  /**
   * Get CA key path
   */
  getKeyPath(): string {
    return join(this.config.outDir, this.config.files.key);
  }
}
