import assert from 'assert';
import {remove} from 'fs-extra';
import {first} from 'lodash-es';
import path from 'path';
import {expect} from 'vitest';
import {IForeLogger} from '../utils/exports.js';
import {resolvePathUnderWorkingDir} from '../utils/resolvePathUnderWorkingDir.js';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {closeMongoClient, getMongoClient} from './connection.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {stopMongoMain} from './stopMongo.js';
import {findAdminUser} from './user/findUtils.js';

export async function checkAdminCanConnect(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}) {
  const {mongoRunConfig, logger} = params;

  const adminUser = findAdminUser({
    users: mongoRunConfig.users,
    isRequired: true,
  });
  const client = await getMongoClient({
    mongoRunConfig,
    logger,
    authUser: adminUser,
    connectionType: 'replicaSet',
  });

  try {
    // Check if the client is connected to the admin DB
    await expect(client.db('admin').command({ping: 1})).resolves.toBeDefined();
  } finally {
    await closeMongoClient(client, /** params */ {});
  }
}

export async function checkTestDbUserCanConnect(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  username: string;
}) {
  const {mongoRunConfig, logger, username} = params;

  const testDbUser = mongoRunConfig.users.find(
    user => user.username === username
  );
  if (!testDbUser) {
    throw new Error('Test DB user not found');
  }

  const client = await getMongoClient({
    mongoRunConfig,
    logger,
    authUser: testDbUser,
    connectionType: 'replicaSet',
  });

  const testDb = first(testDbUser.roles)?.db;
  assert.ok(testDb, 'Test DB not found');

  try {
    // Check if the client is connected to the test DB
    await expect(client.db(testDb).command({ping: 1})).resolves.toBeDefined();
  } finally {
    await closeMongoClient(client, /** params */ {});
  }
}

export async function checkMongoVersion(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  expectedVersion: string;
}) {
  const {mongoRunConfig, logger, expectedVersion} = params;

  const client = await getMongoClient({
    mongoRunConfig,
    logger,
    connectionType: 'replicaSet',
  });

  try {
    const adminDb = client.db('admin');
    const result = await adminDb.command({buildInfo: 1});
    const version = result.version;
    expect(version).toBe(expectedVersion);
  } finally {
    await closeMongoClient(client, /** params */ {});
  }
}

export async function checkUserHasRole(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  username: string;
  role: string;
  db: string;
}) {
  const {
    mongoRunConfig,
    logger,
    username,
    role: roleToCheck,
    db: dbToCheck,
  } = params;

  const adminUser = findAdminUser({
    users: mongoRunConfig.users,
    isRequired: true,
  });

  const client = await getMongoClient({
    mongoRunConfig,
    logger,
    authUser: adminUser,
    connectionType: 'replicaSet',
  });

  try {
    const adminDb = client.db('admin');
    const result = await adminDb.command({usersInfo: username});
    const user = result.users.find(
      (user: {user: string}) => user.user === username
    );
    expect(
      user?.roles.some(
        (role: {role: string; db: string}) =>
          role.role === roleToCheck && role.db === dbToCheck
      )
    ).toBe(true);
  } finally {
    await closeMongoClient(client, /** params */ {});
  }
}

export async function endMongoInstancesForTest(params: {
  mongoRunConfig: MongoRunConfig;
}) {
  const {mongoRunConfig} = params;
  const logger = new ConsoleForeLogger({silent: true});
  await stopMongoMain({mongoRunConfig, logger});
}

export async function cleanupMongoTest(params: {
  mongoRunConfig: MongoRunConfig;
  cleanInstances?: boolean;
  cleanDirs?: boolean;
}) {
  const {mongoRunConfig, cleanDirs = true, cleanInstances = cleanDirs} = params;

  // We must clean instances if we're cleaning dirs otherwise the instances will
  // hang and won't close
  if (cleanInstances || cleanDirs) {
    await endMongoInstancesForTest({mongoRunConfig});
  }

  if (cleanDirs) {
    const configsDir = resolvePathUnderWorkingDir(
      mongoRunConfig.workingDir,
      'mongo-configs'
    );
    const dataDir = resolvePathUnderWorkingDir(
      mongoRunConfig.workingDir,
      'mongo-data'
    );
    const systemLogsDir = resolvePathUnderWorkingDir(
      mongoRunConfig.workingDir,
      'mongo-system-logs'
    );
    // const certsOutDir = path.join(
    //   mongoRunConfig.workingDir,
    //   'mongo-certs-out'
    // );
    // const certsConfigsDir = path.join(
    //   mongoRunConfig.workingDir,
    //   'mongo-certs-configs'
    // );
    await remove(configsDir);
    await remove(dataDir);
    await remove(systemLogsDir);
    // await remove(certsOutDir);
    // await remove(certsConfigsDir);
  }
}
