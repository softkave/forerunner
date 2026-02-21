import {promises as fs} from 'fs';
import path from 'path';
import {createInterface} from 'readline';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {readPassword} from '../utils/readPassword.js';
import {generateMongoPassword} from './utils.js';
import {
  InstanceHostnameEntry,
  MongoRunConfig,
  mongoRunConfigSchema,
} from './mongoRunConfig.js';
import {MongoUser} from './user/types.js';

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
): Promise<Partial<MongoRunConfig>> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const config: Partial<MongoRunConfig> = {};

  try {
    logger.log('MongoDB Configuration Scaffold');
    logger.log('Press Enter to use defaults (shown in brackets)');

    const workingDir = await question(
      rl,
      `Working directory [${process.cwd()}]: `
    );
    if (workingDir.trim()) {
      config.workingDir = workingDir.trim();
    } else {
      config.workingDir = process.cwd();
    }

    const version = await question(rl, 'MongoDB version [8.2.3]: ');
    if (version.trim()) {
      config.mongoVersion = version.trim();
    }

    const containerName = await question(
      rl,
      'Container name prefix (optional, press Enter to skip): '
    );
    if (containerName.trim()) {
      config.containerName = containerName.trim();
    }

    logger.log('\nSSL Certificate Authority Configuration (required):');
    const caCountry = await question(rl, 'CA Country (2-letter code) [US]: ');
    const caState = await question(rl, 'CA State/Province [Delaware]: ');
    const caLocality = await question(rl, 'CA Locality/City [Dover]: ');
    const caOrg = await question(
      rl,
      'CA Organization [softkave-forerunner-mongo]: '
    );
    const caCN = await question(rl, 'CA Common Name [MongoDB CA]: ');
    const caDaysStr = await question(
      rl,
      'CA Certificate validity (days) [3650]: '
    );
    const caPassphrase = await readPassword(
      'CA Passphrase (optional, press Enter to skip): '
    );

    config.caConfig = {
      days: caDaysStr.trim() ? parseInt(caDaysStr.trim(), 10) : 3650,
      subject: {
        C: caCountry.trim() || 'US',
        ST: caState.trim() || 'Delaware',
        L: caLocality.trim() || 'Dover',
        O: caOrg.trim() || 'softkave-forerunner-mongo',
        CN: caCN.trim() || 'MongoDB CA',
      },
      passphrase: caPassphrase.trim() || undefined,
    };

    logger.log('\nReplica Set Configuration:');
    const replicaSetName = await question(
      rl,
      'Replica set name [my-mongo-rs]: '
    );
    config.replicaSetName = replicaSetName.trim() || 'my-mongo-rs';

    const bindLocalhostStr = await question(
      rl,
      'Bind to localhost? (y/n) [y]: '
    );
    config.bindLocalhost =
      bindLocalhostStr.trim().toLowerCase() !== 'n' &&
      bindLocalhostStr.trim().toLowerCase() !== 'no';

    logger.log('\nInstance Configuration (minimum 3 instances required):');
    const instanceCountStr = await question(rl, 'Number of instances [3]: ');
    const instanceCount = instanceCountStr.trim()
      ? parseInt(instanceCountStr.trim(), 10)
      : 3;
    if (instanceCount < 3) {
      throw new Error('At least 3 instances are required for a replica set');
    }

    const instancePorts: number[] = [];
    const instancesHostnames: InstanceHostnameEntry[] = [];

    for (let i = 0; i < instanceCount; i++) {
      const portStr = await question(
        rl,
        `Port for instance ${i + 1} [${27017 + i}]: `
      );
      const port = portStr.trim() ? parseInt(portStr.trim(), 10) : 27017 + i;
      instancePorts.push(port);

      const hostnameStr = await question(
        rl,
        `Hostname for instance ${i + 1} [localhost]: `
      );
      const hostname = hostnameStr.trim() || 'localhost';
      instancesHostnames.push(hostname);
    }

    config.instancePorts = instancePorts;
    config.instancesHostnames = instancesHostnames;

    logger.log('\nAuthentication and Authorization:');
    const authStr = await question(rl, 'Authorization enabled? (y/n) [y]: ');
    const authEnabled =
      authStr.trim().toLowerCase() !== 'n' &&
      authStr.trim().toLowerCase() !== 'no';
    config.authorization = authEnabled ? 'enabled' : 'disabled';

    // Users configuration
    const users: MongoUser[] = [];
    if (authEnabled) {
      // Admin user (required when authorization is enabled)
      logger.log('\nAdmin User (required for authorization):');
      logger.log(
        'This user has userAdminAnyDatabase role for user management.'
      );
      const adminUsername = await question(rl, 'Admin username [admin]: ');
      const adminPassword = await readPassword(
        'Admin password (press Enter to auto-generate): '
      );

      const adminPasswordFinal =
        adminPassword.trim() || generateMongoPassword();
      if (!adminPassword.trim()) {
        logger.log(`✅ Auto-generated password: ${adminPasswordFinal}`);
      }

      users.push({
        username: adminUsername.trim() || 'admin',
        password: adminPasswordFinal,
        roles: [{role: 'userAdminAnyDatabase', db: 'admin'}],
      });

      // Cluster admin user (required when authorization is enabled)
      logger.log('\nCluster Admin User (required for replica set operations):');
      logger.log(
        'This user has clusterAdmin role for replica set management (restart, status, reconfig).'
      );
      const clusterAdminUsername = await question(
        rl,
        'Cluster admin username [cluster-admin]: '
      );
      const clusterAdminPassword = await readPassword(
        'Cluster admin password (press Enter to auto-generate): '
      );

      const clusterAdminPasswordFinal =
        clusterAdminPassword.trim() || generateMongoPassword();
      if (!clusterAdminPassword.trim()) {
        logger.log(`✅ Auto-generated password: ${clusterAdminPasswordFinal}`);
      }

      users.push({
        username: clusterAdminUsername.trim() || 'cluster-admin',
        password: clusterAdminPasswordFinal,
        roles: [{role: 'clusterAdmin', db: 'admin'}],
      });
    } else {
      // When authorization is disabled, users array can be empty but must exist
      logger.log('\nAdmin User (optional when authorization is disabled):');
      const adminUsername = await question(
        rl,
        'Admin username (optional, press Enter to skip): '
      );
      const adminPassword = await readPassword(
        'Admin password (optional, press Enter to auto-generate or skip): '
      );

      if (adminUsername.trim() || adminPassword.trim()) {
        users.push({
          username: adminUsername.trim() || 'admin',
          password: adminPassword.trim() || generateMongoPassword(),
          roles: [{role: 'userAdminAnyDatabase', db: 'admin'}],
        });
      }
    }

    // Additional users
    logger.log('\nAdditional Users (optional):');
    const addMoreUsers = await question(
      rl,
      'Add additional users? (y/n) [n]: '
    );
    if (addMoreUsers.trim().toLowerCase() === 'y') {
      let addAnother = true;

      while (addAnother) {
        const username = await question(rl, 'Username (empty to finish): ');
        if (!username.trim()) {
          addAnother = false;
          break;
        }

        const password = await readPassword(
          'Password (press Enter to auto-generate): '
        );
        const finalPassword = password.trim() || generateMongoPassword();
        if (!password.trim()) {
          logger.log(`✅ Auto-generated password: ${finalPassword}`);
        }

        logger.log(
          'Available roles: userAdminAnyDatabase, readAnyDatabase, clusterAdmin, readWrite, read'
        );
        const rolesStr = await question(
          rl,
          'Roles (comma-separated, format: role:db, e.g., readWrite:test-db,read:admin) [readWrite:admin]: '
        );

        const roles: {role: string; db: string}[] = [];
        if (rolesStr.trim()) {
          const rolePairs = rolesStr.split(',');
          for (const pair of rolePairs) {
            const [role, db] = pair.trim().split(':');
            if (role && db) {
              roles.push({role: role.trim(), db: db.trim()});
            }
          }
        } else {
          roles.push({role: 'readWrite', db: 'admin'});
        }

        const authDb = await question(
          rl,
          'Auth database (optional, press Enter to skip): '
        );

        users.push({
          username: username.trim(),
          password: password.trim(),
          roles,
          authDb: authDb.trim() || undefined,
        });

        const more = await question(rl, 'Add another user? (y/n) [n]: ');
        addAnother = more.trim().toLowerCase() === 'y';
      }
    }

    config.users = users;
  } finally {
    rl.close();
  }

  return config;
}

function getDefaultConfig(): MongoRunConfig {
  return {
    workingDir: process.cwd(),
    mongoVersion: '8.2.3',
    caConfig: {
      days: 3650,
      subject: {
        C: 'US',
        ST: 'Delaware',
        L: 'Dover',
        O: 'softkave-forerunner-mongo',
        CN: 'MongoDB CA',
      },
    },
    replicaSetName: 'my-mongo-rs',
    bindLocalhost: true,
    instancePorts: [27017, 27018, 27019],
    instancesHostnames: ['localhost', 'localhost', 'localhost'],
    authorization: 'enabled',
    users: [
      {
        username: 'admin',
        password: generateMongoPassword(),
        roles: [{role: 'userAdminAnyDatabase', db: 'admin'}],
      },
      {
        username: 'cluster-admin',
        password: generateMongoPassword(),
        roles: [{role: 'clusterAdmin', db: 'admin'}],
      },
    ],
  };
}

export async function scaffoldMongoConfig(params: {
  outputPath: string;
  logger?: IForeLogger;
  useDefaults?: boolean;
}): Promise<MongoRunConfig> {
  const {
    outputPath,
    logger = new ConsoleForeLogger({silent: false}),
    useDefaults = false,
  } = params;

  let config: Partial<MongoRunConfig>;

  if (useDefaults) {
    config = getDefaultConfig();
    logger.log('Using default configuration values');
  } else {
    config = await promptForConfig(logger);
  }

  // Validate and transform config
  const validatedConfig = mongoRunConfigSchema.parse(config);

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
