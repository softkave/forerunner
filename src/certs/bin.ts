#!/usr/bin/env node
/* eslint-disable n/no-process-exit */

import {Command} from 'commander';
import {readFileSync} from 'fs';
import {ForeLogger} from '../utils/foreLogger.js';
import {CAGenerator} from './caGenerator.js';
import {CertGenerator} from './certGenerator.js';
import {CAConfigSchema, CertConfigSchema, CLIOptionsSchema} from './types.js';

const program = new Command();

program
  .name('certs')
  .description('CA and certificates generator for softkave infra')
  .version('1.0.0');

// CA command
program
  .command('ca')
  .description('Generate a Certificate Authority')
  .requiredOption('-c, --config <path>', 'Path to CA configuration JSON file')
  .option('-f, --force', 'Force regeneration even if CA already exists')
  .option('-w, --cwd <path>', 'Working directory')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ForeLogger({silent: options.silent});

    try {
      // Parse and validate CLI options
      const cliOptions = CLIOptionsSchema.parse({
        force: options.force,
        config: options.config,
        cwd: options.cwd,
        silent: options.silent,
      });

      // Read and parse config file
      if (cliOptions.cwd) {
        process.chdir(cliOptions.cwd);
      }
      const configContent = readFileSync(cliOptions.config, 'utf-8');
      const config = CAConfigSchema.parse(JSON.parse(configContent));

      // Generate CA
      const caGenerator = new CAGenerator(config);
      await caGenerator.generate(cliOptions.force);

      logger.log('✅ CA generation completed successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Certificate command
program
  .command('cert')
  .description('Generate a signed certificate using a CA')
  .requiredOption(
    '-c, --config <path>',
    'Path to certificate configuration JSON file'
  )
  .option(
    '-f, --force',
    'Force regeneration even if certificate already exists'
  )
  .option('-w, --cwd <path>', 'Working directory')
  .option('-s, --silent', 'Silent mode')
  .action(async options => {
    const logger = new ForeLogger({silent: options.silent});

    try {
      // Parse and validate CLI options
      const cliOptions = CLIOptionsSchema.parse({
        force: options.force,
        config: options.config,
        cwd: options.cwd,
        silent: options.silent,
      });

      // Read and parse config file
      if (cliOptions.cwd) {
        process.chdir(cliOptions.cwd);
      }
      const configContent = readFileSync(cliOptions.config, 'utf-8');
      const config = CertConfigSchema.parse(JSON.parse(configContent));

      // Generate certificate
      const certGenerator = new CertGenerator(config);
      await certGenerator.generate(cliOptions.force);

      logger.log('✅ Certificate generation completed successfully');
    } catch (error) {
      logger.error('❌ Error:', error instanceof Error ? error.message : error);
      logger.onSilentFail(error);
      process.exit(1);
    }
  });

// Help command
program
  .command('help')
  .description('Show detailed help information')
  .action(() => {
    console.log(`
CA and Certificates Generator

USAGE:
  certs <command> [options]

COMMANDS:
  ca                    Generate a Certificate Authority
  cert                  Generate a signed certificate using a CA
  help                  Show this help message

EXAMPLES:
  # Generate a CA
  certs ca -c ca-config.json

  # Generate a certificate
  certs cert -c cert-config.json

  # Force regeneration
  certs ca -c ca-config.json -f
  certs cert -c cert-config.json -f

  # Set working directory
  certs ca -c ca-config.json -w /path/to/working/dir
  certs cert -c cert-config.json -w /path/to/working/dir

  # Silent mode
  certs ca -c ca-config.json -s
  certs cert -c cert-config.json -s

CONFIGURATION:
  Both commands require a JSON configuration file. See examples below.

CA Configuration Example:
  {
    "caName": "fimidara-root-ca",
    "outDir": "./certs",
    "days": 3650,
    "subject": {
      "C": "US",
      "ST": "Delaware",
      "L": "Dover",
      "O": "fimidara",
      "CN": "fimidara Root CA"
    },
    "files": {
      "key": "ca.key.pem",
      "cert": "ca.crt.pem",
      "csr": "ca.csr.pem",
      "chain": "ca-chain.pem"
    },
    "passphrase": "optional-passphrase"
  }

Certificate Configuration Example:
  {
    "certName": "fimidara.com",
    "outDir": "./certs",
    "days": 825,
    "subject": {
      "C": "US",
      "ST": "Delaware",
      "L": "Dover",
      "O": "fimidara",
      "CN": "fimidara.com"
    },
    "san": ["fimidara.com", "www.fimidara.com", "127.0.0.1"],
    "files": {
      "key": "fimidara.com.key.pem",
      "cert": "fimidara.com.crt.pem",
      "csr": "fimidara.com.csr.pem",
      "fullchain": "fimidara.com.fullchain.pem"
    },
    "ca": {
      "dir": "./certs/fimidara-root-ca",
      "passphrase": "ca-passphrase"
    },
    "passphrase": "optional-passphrase"
  }
`);
  });

// Default action
if (process.argv.length === 2) {
  program.help();
}

program.parse();
