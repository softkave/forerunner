import fs from 'fs';
import {ZodError} from 'zod';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {mongoRunConfigSchema} from './mongoRunConfig.js';

/** Format Zod validation errors for console output */
function formatZodError(error: ZodError): string {
  const lines = error.issues.map(issue => {
    const pathStr = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `  ${pathStr}: ${issue.message}`;
  });
  return 'Validation failed:\n' + lines.join('\n');
}

export async function validateMongoConfig(params: {
  configPath: string;
  logger: IForeLogger;
}): Promise<void> {
  const {configPath, logger} = params;
  try {
    const raw = await fs.promises.readFile(configPath, 'utf8');
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (parseError) {
      logger.error(
        '❌ Invalid JSON:',
        parseError instanceof Error ? parseError.message : String(parseError)
      );
      throw new Error('Invalid JSON');
    }
    const result = mongoRunConfigSchema.safeParse(data);
    if (result.success) {
      logger.log('✅ MongoDB configuration is valid');
      return;
    }
    logger.error('❌ ' + formatZodError(result.error));
    throw result.error;
  } catch (error) {
    if (error instanceof ZodError) {
      logger.error('❌ ' + formatZodError(error));
    } else if (!(error instanceof Error && error.message === 'Invalid JSON')) {
      logger.error(
        '❌ Error:',
        error instanceof Error ? error.message : String(error)
      );
    }
    throw error;
  }
}
