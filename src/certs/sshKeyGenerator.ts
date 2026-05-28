import {promises as fsp} from 'fs';
import {dirname, join} from 'path';
import {fs} from 'zx';
import {fileExists} from '../utils/file.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {resolvePathUnderWorkingDir} from '../utils/resolvePathUnderWorkingDir.js';
import {spawnInherit} from '../utils/spawnInherit.js';
import {
  GenerateSSHKeyCLIOptions,
  GenerateSSHKeyCLIOptionsSchema,
  SSHKeygenConfig,
  SSHKeygenConfigSchema,
} from './types.js';

async function resolveOutputFilepath(
  config: SSHKeygenConfig,
  cwd?: string
): Promise<string> {
  let p = config.path.trim();
  if (cwd) {
    p = resolvePathUnderWorkingDir(cwd, p);
  }

  if (!p) {
    throw new Error('Path is required');
  }

  // Heuristic: treat paths ending with a slash (or existing directory) as a dir.
  const looksLikeDir = p.endsWith('/') || p.endsWith('\\');
  if (looksLikeDir) {
    const filename =
      config.algorithm === 'rsa'
        ? 'id_rsa'
        : config.algorithm === 'ecdsa'
          ? 'id_ecdsa'
          : 'id_ed25519';
    return join(p, filename);
  }

  // If the directory exists and is a directory, treat as dir.
  try {
    const stat = await fsp.stat(p);
    if (stat.isDirectory()) {
      const filename =
        config.algorithm === 'rsa'
          ? 'id_rsa'
          : config.algorithm === 'ecdsa'
            ? 'id_ecdsa'
            : 'id_ed25519';
      return join(p, filename);
    }
  } catch {
    // ignore
  }

  return p;
}

export class SSHKeyGenerator {
  private config: SSHKeygenConfig;
  private logger: IForeLogger;
  private cwd?: string;

  constructor(params: {
    config: SSHKeygenConfig;
    logger: IForeLogger;
    cwd?: string;
  }) {
    this.config = params.config;
    this.logger = params.logger;
    this.cwd = params.cwd;
  }

  async generate(
    force = false
  ): Promise<{privateKeyPath: string; publicKeyPath: string}> {
    const privateKeyPath = await resolveOutputFilepath(this.config, this.cwd);
    const publicKeyPath = `${privateKeyPath}.pub`;

    if (
      !force &&
      ((await fileExists(privateKeyPath)) || (await fileExists(publicKeyPath)))
    ) {
      this.logger.log(
        `✅ SSH key already exists at ${privateKeyPath}. Use --force to overwrite.`
      );
      return {privateKeyPath, publicKeyPath};
    }

    const outDir = dirname(privateKeyPath);
    await fsp.mkdir(outDir, {recursive: true});

    this.logger.log(`🔑 Generating SSH key: ${privateKeyPath}`);

    const args: string[] = [
      '-t',
      this.config.algorithm ?? 'ed25519',
      '-f',
      privateKeyPath,
      ...(this.config.comment ? ['-C', this.config.comment] : []),
      ...(this.config.passphrase ? ['-N', this.config.passphrase] : []),
    ];

    // Only include -b for algorithms that use it.
    if (this.config.algorithm !== 'ed25519') {
      const bits =
        this.config.bits ??
        (this.config.algorithm === 'rsa'
          ? 4096
          : this.config.algorithm === 'ecdsa'
            ? 521
            : undefined);
      if (!bits) {
        throw new Error(`Missing bits for algorithm: ${this.config.algorithm}`);
      }
      args.push('-b', String(bits));
    }

    // Ensure we overwrite without prompts if force is set.
    if (force) args.push('-q');

    // ssh-keygen overwrites when -f exists only with user confirmation; we use
    // -q to reduce output, but still need to avoid prompt. The safest way is
    // removing files first when force is enabled.
    if (force) {
      try {
        await fs.promises.unlink(privateKeyPath);
      } catch {
        // ignore
      }
      try {
        await fs.promises.unlink(publicKeyPath);
      } catch {
        // ignore
      }
    }

    await spawnInherit('ssh-keygen', args);

    this.logger.log(`✅ SSH key generated successfully: ${privateKeyPath}`);
    return {privateKeyPath, publicKeyPath};
  }
}

export async function generateSSHKey(params: {
  /**
   * When provided, the config object is used directly (no file IO).
   * If both `config` and `configFilepath` are provided, `config` wins.
   */
  config?: SSHKeygenConfig;
  /**
   * Path to a JSON config file. Used when `config` is not provided.
   */
  configFilepath?: string;
  /**
   * Working directory to resolve relative paths from (default: current process
   * cwd).
   */
  cwd?: string;
  /**
   * Force regeneration even if files exist.
   */
  force?: boolean;
  logger: IForeLogger;
}) {
  let config: SSHKeygenConfig;
  if (params.config) {
    config = SSHKeygenConfigSchema.parse(params.config);
  } else {
    if (!params.configFilepath) {
      throw new Error('Either config or configFilepath must be provided');
    }
    const configContent = await fs.promises.readFile(
      params.configFilepath,
      'utf-8'
    );
    config = SSHKeygenConfigSchema.parse(JSON.parse(configContent));
  }

  const generator = new SSHKeyGenerator({
    config,
    logger: params.logger,
    cwd: params.cwd,
  });
  return await generator.generate(params.force ?? false);
}

export async function generateSSHKeyFromCliOptions(params: {
  opts: GenerateSSHKeyCLIOptions;
  logger: IForeLogger;
}) {
  const opts = GenerateSSHKeyCLIOptionsSchema.parse(params.opts);

  // If a config file is provided, use it.
  if (opts.config) {
    await generateSSHKey({
      configFilepath: opts.config,
      cwd: opts.cwd,
      force: opts.force,
      logger: params.logger,
    });
    params.logger.log('✅ SSH key generation completed successfully');
    return;
  }

  // Otherwise build a config from CLI flags.
  const config: SSHKeygenConfig = {
    algorithm: opts.algorithm ?? 'ed25519',
    bits:
      opts.algorithm === 'rsa'
        ? (opts.bits ?? 4096)
        : opts.algorithm === 'ecdsa'
          ? (opts.bits ?? 521)
          : undefined,
    comment: opts.comment,
    passphrase: opts.passphrase,
    path: opts.path ?? './ssh-keys/',
  };

  await generateSSHKey({
    config,
    force: opts.force,
    logger: params.logger,
    cwd: opts.cwd,
  });
  params.logger.log('✅ SSH key generation completed successfully');
}
