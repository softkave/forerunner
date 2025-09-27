import assert from 'assert';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {
  findAdminMongoUser,
  getMongoUsersConfigFilePath,
  readMongoUsers,
} from './setupMongoUsers.js';
import {getMongoClientForReplicaSet} from './utils.js';

/**
 * Returns the status of the replica set. If the replica set is not initialized,
 * an error will be thrown.
 * https://www.mongodb.com/docs/manual/reference/command/replSetGetStatus/#mongodb-dbcommand-dbcmd.replSetGetStatus
 */

/**
 * Member replica set states:
 * https://www.mongodb.com/docs/manual/reference/replica-states/
 *
 * | Code | State      | Meaning                                                                   |
 * | ---- | ---------- | ------------------------------------------------------------------------- |
 * | 0    | STARTUP    | Node is starting up, before joining the replica set.                      |
 * | 1    | PRIMARY    | Node is the primary, receiving writes.                                    |
 * | 2    | SECONDARY  | Node is a secondary, replicating from the primary (or another secondary). |
 * | 3    | RECOVERING | Node is up but not yet ready for reads/writes (catching up or offline).   |
 * | 5    | STARTUP2   | Node has joined the replica set and is starting replication.              |
 * | 6    | UNKNOWN    | Node cannot be reached by this member (no heartbeat response).            |
 * | 7    | ARBITER    | Node is an arbiter (only votes in elections, no data).                    |
 * | 8    | DOWN       | Node was marked as unreachable/down.                                      |
 * | 9    | ROLLBACK   | Node is rolling back inconsistent writes.                                 |
 * | 10   | REMOVED    | Node was removed from the replica set config.                             |
 */

const kMemberReplicaSetStates: Record<number, string> = {
  0: 'STARTUP',
  1: 'PRIMARY',
  2: 'SECONDARY',
  3: 'RECOVERING',
  5: 'STARTUP2',
  6: 'UNKNOWN',
  7: 'ARBITER',
  8: 'DOWN',
  9: 'ROLLBACK',
  10: 'REMOVED',
};

const kMemberHealth: Record<number, string> = {
  0: 'UNHEALTHY',
  1: 'HEALTHY',
};

export interface ReplicaSetStatusParams {
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
  preferLocalhost?: boolean;
  printStatus?: boolean;
}

export async function replicaSetStatus(params: ReplicaSetStatusParams) {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    preferLocalhost,
    printStatus = false,
  } = params;

  // Read Mongo users from the config file
  const mongoUsers = await readMongoUsers({
    configFilePath: getMongoUsersConfigFilePath(mongoRunConfig),
  });

  // Find the admin user
  const adminUser = await findAdminMongoUser({
    mongoUsers,
    createIfNotFound: false,
  });

  assert.ok(adminUser, 'Admin user not found');
  const client = await getMongoClientForReplicaSet({
    username: adminUser.username,
    password: adminUser.password,
    mongoRunConfig,
    logger,
    preferLocalhost,
  });

  try {
    // Connect to the admin database
    const adminDb = client.db('admin');

    // Get the replica set status using the replSetGetStatus command
    const status = await adminDb.command({replSetGetStatus: 1});

    // Optionally print the status to console if requested
    if (printStatus && logger) {
      logger.log('Replica Set Status:');
      logger.log(`Set: ${status.set}`);
      logger.log(`Date: ${status.date}`);

      if (status.members && Array.isArray(status.members)) {
        logger.log('Members:');
        status.members.forEach((member: any) => {
          logger.log(`  - Hostname: ${member.name}`);
          logger.log(
            `    Status: ${member.stateStr || kMemberReplicaSetStates[member.state as number] || 'UNKNOWN'}`
          );
          logger.log(
            `    Health: ${kMemberHealth[member.health as number] || 'UNKNOWN'}`
          );
          if (member.lastHeartbeat) {
            logger.log(`    Last Heartbeat: ${member.lastHeartbeat}`);
          }
        });
      }
    }

    return status;
  } finally {
    await client.close();
  }
}
