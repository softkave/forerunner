import {promises as fs} from 'fs';
import path from 'path';
import {createInterface} from 'readline';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {readPassword} from '../utils/readPassword.js';
import {
  PostgresRunConfig,
  postgresRunConfigSchema,
} from './postgresRunConfig.js';

function question(
  rl: ReturnType<typeof createInterface>,
  query: string
): Promise<string> {
  return new Promise(resolve => {
    rl.question(query, resolve);
  });
}

async function promptForConfig(
  logger: IForeLogger
): Promise<Partial<PostgresRunConfig>> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const config: Partial<PostgresRunConfig> = {};

  try {
    logger.log('PostgreSQL Configuration Scaffold');
    logger.log('Press Enter to use defaults (shown in brackets)');

    const workingDir = await question(
      rl,
      `Working directory [${process.cwd()}]: `
    );
    if (workingDir.trim()) {
      config.workingDir = workingDir.trim();
    }

    const portStr = await question(rl, 'Port [5432]: ');
    if (portStr.trim()) {
      config.port = parseInt(portStr.trim(), 10);
    } else {
      config.port = 5432;
    }

    const containerName = await question(rl, 'Container name [postgres-db]: ');
    config.containerName = containerName.trim() || 'postgres-db';

    const volumeName = await question(
      rl,
      `Volume name [${config.containerName}]: `
    );
    if (volumeName.trim()) {
      config.volumeName = volumeName.trim();
    }

    const version = await question(rl, 'PostgreSQL version [16]: ');
    if (version.trim()) {
      config.postgresVersion = version.trim();
    }

    const keepStr = await question(
      rl,
      'Keep data across restarts? (y/n) [n]: '
    );
    config.keep = keepStr.trim().toLowerCase() === 'y';

    const authStr = await question(
      rl,
      'Authorization enabled? (local and TCP require password) (y/n) [n]: '
    );
    config.authorization =
      authStr.trim().toLowerCase() === 'y' ? 'enabled' : 'disabled';

    const sslStr = await question(rl, 'SSL enabled? (y/n) [n]: ');
    const sslEnabled = sslStr.trim().toLowerCase() === 'y';
    if (sslEnabled) {
      config.ssl = 'enabled';
      logger.log('\nSSL Certificate Authority Configuration:');
      const caCountry = await question(rl, 'CA Country (2-letter code) [US]: ');
      const caState = await question(rl, 'CA State/Province [CA]: ');
      const caLocality = await question(
        rl,
        'CA Locality/City [San Francisco]: '
      );
      const caOrg = await question(rl, 'CA Organization [MyOrg]: ');
      const caCN = await question(rl, 'CA Common Name [PostgreSQL CA]: ');
      const caDaysStr = await question(
        rl,
        'CA Certificate validity (days) [365]: '
      );
      const caPassphrase = await readPassword(
        'CA Passphrase (optional, press Enter to skip): '
      );

      config.caConfig = {
        outDir: path.resolve(config.workingDir ?? process.cwd(), 'certs'),
        files: {
          key: 'ca.key.pem',
          cert: 'ca.crt.pem',
          csr: 'ca.csr.pem',
          chain: 'ca-chain.pem',
        },
        days: caDaysStr.trim() ? parseInt(caDaysStr.trim(), 10) : 365,
        subject: {
          C: caCountry.trim() || 'NG',
          ST: caState.trim() || 'LA',
          L: caLocality.trim() || 'Ikeja',
          O: caOrg.trim() || 'MyOrg',
          CN: caCN.trim() || 'PostgreSQL CA',
        },
        passphrase: caPassphrase.trim() || undefined,
      };
    } else {
      config.ssl = 'disabled';
    }

    // Admin user (when authorization enabled, password is required)
    logger.log('\nAdmin User (first user):');
    const adminUsername = await question(rl, 'Admin username [admin]: ');
    const adminPassword = await readPassword(
      config.authorization === 'enabled'
        ? 'Admin password (required): '
        : 'Admin password (optional, for trust auth): '
    );

    if (adminUsername.trim() || adminPassword.trim()) {
      config.users = [
        {
          username: adminUsername.trim() || 'admin',
          password: adminPassword.trim() || undefined,
        },
      ];
    }

    // Additional users
    logger.log('\nAdditional Users (optional):');
    const addMoreUsers = await question(
      rl,
      'Add additional users? (y/n) [n]: '
    );
    if (addMoreUsers.trim().toLowerCase() === 'y') {
      const users = config.users ?? [];
      let addAnother = true;

      while (addAnother) {
        const username = await question(rl, 'Username (empty to finish): ');
        if (!username.trim()) {
          addAnother = false;
          break;
        }

        const password = await readPassword(
          'Password (empty for trust auth): '
        );
        users.push({
          username: username.trim(),
          password: password.trim() || undefined,
        });

        const more = await question(rl, 'Add another user? (y/n) [n]: ');
        addAnother = more.trim().toLowerCase() === 'y';
      }

      config.users = users;
    }

    // Databases
    logger.log('\nDatabases:');
    const defaultDb = await question(rl, 'Default database name [mydb]: ');
    const dbs: string[] = [];
    if (defaultDb.trim()) {
      dbs.push(defaultDb.trim());
    } else {
      dbs.push('mydb');
    }

    const addMoreDbs = await question(
      rl,
      'Add additional databases? (y/n) [n]: '
    );
    if (addMoreDbs.trim().toLowerCase() === 'y') {
      let addAnother = true;

      while (addAnother) {
        const dbName = await question(rl, 'Database name (empty to finish): ');
        if (!dbName.trim()) {
          addAnother = false;
          break;
        }

        dbs.push(dbName.trim());

        const more = await question(rl, 'Add another database? (y/n) [n]: ');
        addAnother = more.trim().toLowerCase() === 'y';
      }
    }

    config.dbs = dbs;
  } finally {
    rl.close();
  }

  return config;
}

function getDefaultConfig(): PostgresRunConfig {
  return {
    workingDir: process.cwd(),
    port: 5432,
    containerName: 'postgres-db',
    volumeName: 'postgres-db',
    postgresVersion: '16',
    keep: false,
    authorization: 'disabled',
    ssl: 'disabled',
    users: [
      {
        username: 'admin',
        password: 'admin-password',
      },
    ],
    dbs: ['mydb'],
  };
}

export async function scaffoldPostgresConfig(params: {
  outputPath: string;
  logger?: IForeLogger;
  useDefaults?: boolean;
}): Promise<PostgresRunConfig> {
  const {
    outputPath,
    logger = new ConsoleForeLogger({silent: false}),
    useDefaults = false,
  } = params;

  let config: Partial<PostgresRunConfig>;

  if (useDefaults) {
    config = getDefaultConfig();
    logger.log('Using default configuration values');
  } else {
    config = await promptForConfig(logger);
  }

  // Validate and transform config
  const validatedConfig = postgresRunConfigSchema.parse(config);

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, {recursive: true});

  // Write config file
  await fs.writeFile(
    outputPath,
    JSON.stringify(validatedConfig, null, 2),
    'utf8'
  );

  logger.log(`Configuration written to ${outputPath}`);

  return validatedConfig;
}
