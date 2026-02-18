import {execFileSync} from 'child_process';
import console from 'console';
import {existsSync, mkdirSync, unlinkSync, writeFileSync} from 'fs';
import {join} from 'path';
import {fs} from 'zx';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {CAConfig, CAConfigSchema, GenerateCertsCLIOptions} from './types.js';

export class CAGenerator {
  private config: CAConfig;
  private logger: IForeLogger;

  constructor(params: {config: CAConfig; logger: IForeLogger}) {
    this.config = params.config;
    this.logger = params.logger;
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
    const configPath = join(caDir, `openssl-${this.config.files.key}.cnf`);
    writeFileSync(configPath, opensslConfig);

    try {
      // Generate private key (use execFileSync so passphrase is not interpreted by shell)
      this.logger.log('  Generating private key...');
      const genrsaArgs = this.config.passphrase
        ? [
            'genrsa',
            '-aes256',
            '-passout',
            `pass:${this.config.passphrase}`,
            '-out',
            keyPath,
            '4096',
          ]
        : ['genrsa', '-out', keyPath, '4096'];
      execFileSync('openssl', genrsaArgs, {stdio: 'inherit'});

      // Set proper permissions
      execFileSync('chmod', ['400', keyPath], {stdio: 'inherit'});

      // Generate certificate
      this.logger.log('  Generating certificate...');
      const reqArgs = this.config.passphrase
        ? [
            'req',
            '-new',
            '-x509',
            '-key',
            keyPath,
            '-passin',
            `pass:${this.config.passphrase}`,
            '-out',
            certPath,
            '-days',
            String(this.config.days),
            '-config',
            configPath,
          ]
        : [
            'req',
            '-new',
            '-x509',
            '-key',
            keyPath,
            '-out',
            certPath,
            '-days',
            String(this.config.days),
            '-config',
            configPath,
          ];
      execFileSync('openssl', reqArgs, {stdio: 'inherit'});

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

export async function generateCA(params: {
  opts: GenerateCertsCLIOptions;
  logger: IForeLogger;
}) {
  // Read and parse config file
  if (params.opts.cwd) {
    process.chdir(params.opts.cwd);
  }
  console.log('cwd', process.cwd());
  const configContent = await fs.promises.readFile(params.opts.config, 'utf-8');
  const config = CAConfigSchema.parse(JSON.parse(configContent));

  // Generate CA
  const caGenerator = new CAGenerator({config, logger: params.logger});
  await caGenerator.generate(params.opts.force);

  params.logger.log('✅ CA generation completed successfully');
}
