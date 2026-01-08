import assert from 'assert';
import {MongoClient} from 'mongodb';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {MongoRunConfig} from './mongoRunConfig.js';
import {
  findClusterAdminMongoUser,
  getMongoUsersConfigFilePath,
  MongoUser,
  readMongoUsers,
} from './setupMongoUsers.js';
import {
  getMongoClientForInstance,
  getMongoClientForReplicaSet,
  getMongodConfigForInstance,
  separateBindIps,
} from './utils.js';

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

/**
 * Ping option can be:
 * - `'repl'` - Ping the replica set
 * - `'all'` - Ping all members of the replica set
 * - `number` - Ping the member at the given index (1-based) in config order
 */
export type PingOption = 'repl' | 'all' | number | (string & {});

export interface ReplicaSetStatusParams {
  mongoRunConfig: MongoRunConfig;
  logger?: IForeLogger;
  preferLocalhost?: boolean;
  printStatus?: boolean;
  ping?: PingOption;
}

export interface ReplicaSetStatusMember {
  /** The host (hostname:port) of the member */
  name: string;
  /** The state (code) of the member */
  state: number;
  /** The state string of the member */
  stateStr: string;
  health: string;
  lastHeartbeat?: string;
}

export interface ReplicaSetStatusResponse {
  raw: any;
  rawAll: any[];
  set: string;
  date: string;
  members: ReplicaSetStatusMember[];
}

function rawStatusToReplicaSetStatusResponse(
  status: any
): ReplicaSetStatusResponse {
  return {
    raw: status,
    rawAll: [status],
    set: status.set,
    date: status.date,
    members: status.members.map((member: any) => ({
      name: member.name,
      state: member.state,
      stateStr:
        member.stateStr ||
        kMemberReplicaSetStates[member.state as number] ||
        'UNKNOWN',
      health: kMemberHealth[member.health as number] || 'UNKNOWN',
      lastHeartbeat: member.lastHeartbeat,
    })),
  };
}

async function getStatusFromReplicaSet(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  preferLocalhost?: boolean;
  adminUser: MongoUser;
}): Promise<ReplicaSetStatusResponse> {
  let client: MongoClient | null = null;
  try {
    const {
      mongoRunConfig,
      logger = new ConsoleForeLogger({silent: true}),
      preferLocalhost,
      adminUser,
    } = params;
    client = await getMongoClientForReplicaSet({
      mongoRunConfig,
      logger,
      preferLocalhost,
      username: adminUser.username,
      password: adminUser.password,
    });
    const adminDb = client.db('admin');
    const status = await adminDb.command({replSetGetStatus: 1});
    return rawStatusToReplicaSetStatusResponse(status);
  } finally {
    await client?.close();
  }
}

async function getStatusFromInstanceNumber(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  preferLocalhost?: boolean;
  adminUser: MongoUser;
  /** Instance number (1-based) */
  instanceNumber: number;
}): Promise<ReplicaSetStatusResponse> {
  let client: MongoClient | null = null;
  try {
    const {
      mongoRunConfig,
      logger = new ConsoleForeLogger({silent: true}),
      preferLocalhost,
      adminUser,
      instanceNumber,
    } = params;
    client = await getMongoClientForInstance({
      mongoRunConfig,
      logger,
      preferLocalhost,
      username: adminUser.username,
      password: adminUser.password,
      instanceNumber,
    });
    const adminDb = client.db('admin');
    const status = await adminDb.command({replSetGetStatus: 1});
    return rawStatusToReplicaSetStatusResponse(status);
  } finally {
    await client?.close();
  }
}

async function getStatusFromAllMembers(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  preferLocalhost?: boolean;
  adminUser: MongoUser;
}): Promise<ReplicaSetStatusResponse> {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    preferLocalhost,
    adminUser,
  } = params;

  // Get status from all members
  const statuses = await Promise.all(
    mongoRunConfig.instancesHostnames.map(async (hostnames, i) => {
      const instanceNumber = i + 1;
      const status = await getStatusFromInstanceNumber({
        mongoRunConfig,
        logger,
        preferLocalhost,
        adminUser,
        instanceNumber,
      });

      // Get mongod config for the instance
      const mongodConfig = await getMongodConfigForInstance({
        instanceNumber,
        mongoRunConfig,
      });

      // Find the member with the same bind IP
      const bindIps = separateBindIps(mongodConfig.net.bindIp);
      const myMember = status.members.find(member =>
        bindIps.some(bindIp => member.name.includes(bindIp))
      );

      // Return the status and the member
      return {
        status,
        myMember,
      };
    })
  );

  // Create the status response by combining information from all members
  const status: ReplicaSetStatusResponse = {
    raw: statuses[0].status.raw,
    rawAll: statuses.map(status => status.status.raw),
    set: statuses[0].status.set,
    date: statuses[0].status.date,
    members: statuses
      .map(status => status.myMember)
      .filter(
        (member): member is ReplicaSetStatusMember => member !== undefined
      ),
  };
  return status;
}

function printStatusToLogger(
  status: ReplicaSetStatusResponse,
  logger: IForeLogger
) {
  logger.log('Replica Set Status:');
  logger.log(`Set: ${status.set}`);
  logger.log(`Date: ${status.date}`);
  logger.log('Members:');
  status.members.forEach(member => {
    logger.log(`  - Hostname: ${member.name}`);
    logger.log(`    Status: ${member.stateStr}`);
    logger.log(`    Health: ${member.health}`);
    if (member.lastHeartbeat) {
      logger.log(`    Last Heartbeat: ${member.lastHeartbeat}`);
    }
  });
}

export async function replicaSetStatus(params: ReplicaSetStatusParams) {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    preferLocalhost,
    printStatus = false,
    ping,
  } = params;

  // Read Mongo users from the config file
  const mongoUsers = await readMongoUsers({
    configFilePath: getMongoUsersConfigFilePath(mongoRunConfig),
  });

  // Find the cluster admin user
  const clusterAdminUser = await findClusterAdminMongoUser({
    mongoUsers,
    createIfNotFound: false,
  });

  assert.ok(clusterAdminUser, 'Cluster admin user not found');
  let status: ReplicaSetStatusResponse | undefined;
  if (ping === 'all') {
    status = await getStatusFromAllMembers({
      mongoRunConfig,
      logger,
      preferLocalhost,
      adminUser: clusterAdminUser,
    });
  } else if (ping === 'repl') {
    status = await getStatusFromReplicaSet({
      mongoRunConfig,
      logger,
      preferLocalhost,
      adminUser: clusterAdminUser,
    });
  } else if (!isNaN(Number(ping))) {
    status = await getStatusFromInstanceNumber({
      mongoRunConfig,
      logger,
      preferLocalhost,
      adminUser: clusterAdminUser,
      instanceNumber: Number(ping),
    });
  }

  assert.ok(status, 'Status not found');
  if (printStatus) {
    printStatusToLogger(status, logger);
  }

  return status;
}
