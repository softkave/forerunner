import {execSync} from 'child_process';
import {existsSync, mkdirSync, unlinkSync, writeFileSync} from 'fs';
import {join} from 'path';
import {CertConfig} from './types.js';

export class CertGenerator {
  private config: CertConfig;

  constructor(config: CertConfig) {
    this.config = config;
  }

  /**
   * Generate certificate if it doesn't exist or if force is true
   */
  async generate(force = false): Promise<void> {
    const certDir = join(this.config.outDir);
    const keyPath = join(certDir, this.config.files.key);
    const certPath = join(certDir, this.config.files.cert);

    if (existsSync(keyPath) && existsSync(certPath)) {
      if (force) {
        unlinkSync(keyPath);
        unlinkSync(certPath);
      } else {
        console.log(
          `✅ Certificate already exists at ${certDir}. Use --force to regenerate.`
        );
        return;
      }
    }

    console.log(`🔐 Generating certificate: ${this.config.outDir}`);

    // Create output directory
    mkdirSync(certDir, {recursive: true});

    // Generate OpenSSL configuration with SAN
    const opensslConfig = this.generateOpenSSLConfig();
    const configPath = join(certDir, 'openssl.cnf');
    writeFileSync(configPath, opensslConfig);

    try {
      // Generate private key
      console.log('  Generating private key...');
      const keyCmd = this.config.passphrase
        ? `openssl genrsa -aes256 -passout pass:'${this.config.passphrase}' -out "${keyPath}" 2048`
        : `openssl genrsa -out "${keyPath}" 2048`;

      execSync(keyCmd, {stdio: 'inherit'});

      // Generate CSR
      console.log('  Generating CSR...');
      const csrPath = join(certDir, this.config.files.csr);
      const csrCmd = this.config.passphrase
        ? `openssl req -new -key "${keyPath}" -passin pass:'${this.config.passphrase}' -out "${csrPath}" -config "${configPath}"`
        : `openssl req -new -key "${keyPath}" -out "${csrPath}" -config "${configPath}"`;

      execSync(csrCmd, {stdio: 'inherit'});

      // Sign certificate with CA
      console.log('  Signing certificate with CA...');
      const caKeyPath = join(this.config.ca.dir, 'ca.key.pem');
      const caCertPath = join(this.config.ca.dir, 'ca.crt.pem');

      if (!existsSync(caKeyPath) || !existsSync(caCertPath)) {
        throw new Error(`CA files not found at ${this.config.ca.dir}`);
      }

      const signCmd = this.config.ca.passphrase
        ? `openssl x509 -req -in "${csrPath}" -CA "${caCertPath}" -CAkey "${caKeyPath}" -passin pass:'${this.config.ca.passphrase}' -CAcreateserial -out "${certPath}" -days ${this.config.days} -sha256 -extfile "${configPath}" -extensions req_ext`
        : `openssl x509 -req -in "${csrPath}" -CA "${caCertPath}" -CAkey "${caKeyPath}" -CAcreateserial -out "${certPath}" -days ${this.config.days} -sha256 -extfile "${configPath}" -extensions req_ext`;

      execSync(signCmd, {stdio: 'inherit'});

      // Create full chain
      console.log('  Creating full chain...');
      const fullchainPath = join(certDir, this.config.files.fullchain);
      const caChainPath = join(this.config.ca.dir, 'ca-chain.pem');

      if (existsSync(caChainPath)) {
        // Use existing CA chain
        execSync(`cat "${certPath}" "${caChainPath}" > "${fullchainPath}"`, {
          stdio: 'inherit',
        });
      } else {
        // Just use CA cert
        execSync(`cat "${certPath}" "${caCertPath}" > "${fullchainPath}"`, {
          stdio: 'inherit',
        });
      }

      if (this.config.files.crtAndKey) {
        console.log('  Creating CRT and key...');
        const crtAndKeyPath = join(certDir, this.config.files.crtAndKey);
        execSync(`cat "${certPath}" "${keyPath}" > "${crtAndKeyPath}"`, {
          stdio: 'inherit',
        });
      }

      console.log(`✅ Certificate generated successfully at ${certDir}`);
    } catch (error) {
      console.error('❌ Error generating certificate:', error);
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
