import crypto from 'crypto';
import {promises as fsp} from 'fs';
import {dirname} from 'path';
import {fs} from 'zx';
import {fileExists} from '../utils/file.js';
import type {IForeLogger} from '../utils/foreLogger/types.js';
import {resolvePathUnderWorkingDir} from '../utils/resolvePathUnderWorkingDir.js';
import type {GenerateKeyfileCLIOptions, KeyfileConfig} from './types.js';
import {GenerateKeyfileCLIOptionsSchema, KeyfileConfigSchema} from './types.js';

function assertMongoKeyfileConstraints(content: string): void {
  // MongoDB keyFile must be between 6 and 1024 characters.
  // We keep this check conservative and explicit since it’s easy to misconfigure.
  const len = content.length;
  if (len < 6 || len > 1024) {
    throw new Error(
      `MongoDB keyfile must be between 6 and 1024 characters; got ${len}`
    );
  }
}

function encodeKeyMaterial(params: {
  bytes: number;
  encoding: 'base64' | 'hex';
}): string {
  const {bytes, encoding} = params;
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new Error(`bytes must be a positive integer; got ${bytes}`);
  }
  const buf = crypto.randomBytes(bytes);
  return buf.toString(encoding);
}

export class KeyfileGenerator {
  private config: KeyfileConfig;
  private logger: IForeLogger;
  private cwd?: string;

  constructor(params: {
    config: KeyfileConfig;
    logger: IForeLogger;
    cwd?: string;
  }) {
    this.config = params.config;
    this.logger = params.logger;
    this.cwd = params.cwd;
  }

  async generate(force = false): Promise<{path: string; bytesWritten: number}> {
    let path = this.config.path.trim();
    if (this.cwd) {
      path = resolvePathUnderWorkingDir(this.cwd, path);
    }

    if (!force && (await fileExists(path))) {
      this.logger.log(
        `✅ Keyfile already exists at ${path}. Use --force to overwrite.`
      );
      const st = await fsp.stat(path);
      return {path, bytesWritten: st.size};
    }

    await fsp.mkdir(dirname(path), {recursive: true});

    const format = this.config.format ?? 'mongodb';
    const encoding = this.config.encoding ?? 'base64';
    // For MongoDB keyfiles, we default to the maximum-safe size:
    // 756 random bytes -> base64 length 1008 chars (plus optional newline),
    // staying under MongoDB's 1024-char limit while maximizing entropy.
    const bytes = this.config.bytes ?? (format === 'mongodb' ? 756 : 32);
    const newline = this.config.newline ?? true;
    const mode = this.config.mode ?? 0o400;

    let content = encodeKeyMaterial({bytes, encoding});

    if (format === 'mongodb') {
      if (encoding !== 'base64') {
        throw new Error('MongoDB keyfile format requires base64 encoding');
      }
      if (newline) content += '\n';
      assertMongoKeyfileConstraints(content.trimEnd());
    } else if (newline) {
      content += '\n';
    }

    // Write file with restricted permissions. We explicitly chmod afterward
    // for platforms where mode might be affected by umask.
    await fsp.writeFile(path, content, {encoding: 'utf8'});
    await fsp.chmod(path, mode);

    this.logger.log(`✅ Keyfile generated successfully: ${path}`);
    return {path, bytesWritten: Buffer.byteLength(content, 'utf8')};
  }
}

export async function generateKeyfile(params: {
  config?: KeyfileConfig;
  configFilepath?: string;
  cwd?: string;
  force?: boolean;
  logger: IForeLogger;
}): Promise<{path: string; bytesWritten: number}> {
  let config: KeyfileConfig;
  if (params.config) {
    config = KeyfileConfigSchema.parse(params.config);
  } else {
    if (!params.configFilepath) {
      throw new Error('Either config or configFilepath must be provided');
    }
    const configContent = await fs.promises.readFile(
      params.configFilepath,
      'utf-8'
    );
    config = KeyfileConfigSchema.parse(JSON.parse(configContent));
  }

  const generator = new KeyfileGenerator({
    config,
    logger: params.logger,
    cwd: params.cwd,
  });
  return await generator.generate(params.force ?? false);
}

export async function generateKeyfileFromCliOptions(params: {
  opts: GenerateKeyfileCLIOptions;
  logger: IForeLogger;
}): Promise<void> {
  const opts = GenerateKeyfileCLIOptionsSchema.parse(params.opts);

  if (opts.config) {
    await generateKeyfile({
      configFilepath: opts.config,
      force: opts.force,
      logger: params.logger,
      cwd: opts.cwd,
    });
    params.logger.log('✅ Keyfile generation completed successfully');
    return;
  }

  if (!opts.path) {
    throw new Error('path is required when --config is not provided');
  }

  await generateKeyfile({
    config: {
      path: opts.path,
      format: opts.format ?? 'mongodb',
      bytes: opts.bytes,
      encoding: opts.encoding,
      mode: opts.mode,
      newline: opts.newline,
    },
    force: opts.force,
    logger: params.logger,
    cwd: opts.cwd,
  });
  params.logger.log('✅ Keyfile generation completed successfully');
}
