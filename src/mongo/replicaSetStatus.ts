import assert from 'assert';
import {OmitFrom} from 'softkave-js-utils';
import {ValueOf} from 'type-fest';
import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {
  closeMongoClient,
  getMongoClientForInstance,
  GetMongoClientForInstanceParams,
  getMongoClientForReplicaSet,
  GetMongoClientForReplicaSetParams,
} from './connection.js';
import {findReplMemberByInstanceNumber} from './replSetUtils.js';
import {findClusterAdminUser} from './user/findUtils.js';

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

export const kMemberReplicaSetStatesMap = {
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
} as const;

export const kMemberReplicaSetStatesStr = {
  STARTUP: 'STARTUP',
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
  RECOVERING: 'RECOVERING',
  STARTUP2: 'STARTUP2',
  UNKNOWN: 'UNKNOWN',
  ARBITER: 'ARBITER',
  DOWN: 'DOWN',
  ROLLBACK: 'ROLLBACK',
  REMOVED: 'REMOVED',
} as const;

export type MemberReplicaSetState = ValueOf<typeof kMemberReplicaSetStatesStr>;

export const kMemberHealthMap = {
  0: 'UNHEALTHY',
  1: 'HEALTHY',
} as const;

export const kMemberHealthStr = {
  UNHEALTHY: 'UNHEALTHY',
  HEALTHY: 'HEALTHY',
} as const;

export type MemberHealth = ValueOf<typeof kMemberHealthStr>;

/**
 * Ping option can be:
 * - `'repl'` - Ping the replica set
 * - `'all'` - Ping all members of the replica set
 * - `number` - Ping the member at the given index (1-based) in config order
 */
export type PingOption = 'repl' | 'all' | number | (string & {});

export interface GetReplicaSetStatusParams extends GetMongoClientForReplicaSetParams {
  printStatus?: boolean;
  ping?: PingOption;
}

export interface ReplicaSetStatusMember {
  /** The host (hostname:port) of the member */
  name: string;
  /** The state (code) of the member */
  state: number;
  /** The state string of the member */
  stateStr: MemberReplicaSetState;
  health: MemberHealth;
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
        kMemberReplicaSetStatesMap[
          member.state as keyof typeof kMemberReplicaSetStatesMap
        ] ||
        'UNKNOWN',
      health:
        kMemberHealthMap[member.health as keyof typeof kMemberHealthMap] ||
        'UNKNOWN',
      lastHeartbeat: member.lastHeartbeat,
    })),
  };
}

async function getReplStatusFromReplicaSet(
  params: GetMongoClientForReplicaSetParams
): Promise<ReplicaSetStatusResponse> {
  const client = await getMongoClientForReplicaSet(params);

  try {
    const adminDb = client.db('admin');
    const status = await adminDb.command({replSetGetStatus: 1});
    return rawStatusToReplicaSetStatusResponse(status);
  } finally {
    await closeMongoClient(client, params);
  }
}

async function getReplStatusFromInstance(
  params: GetMongoClientForInstanceParams
): Promise<ReplicaSetStatusResponse> {
  const client = await getMongoClientForInstance(params);

  try {
    const adminDb = client.db('admin');
    const status = await adminDb.command({replSetGetStatus: 1});
    return rawStatusToReplicaSetStatusResponse(status);
  } finally {
    await closeMongoClient(client, params);
  }
}

async function getStatusFromAllMembers(
  params: OmitFrom<GetMongoClientForInstanceParams, 'instanceNumber'>
): Promise<ReplicaSetStatusResponse> {
  const {mongoRunConfig} = params;

  // Get status from all members
  const statuses = await Promise.all(
    mongoRunConfig.instancePorts.map(async (_port, i) => {
      const instanceNumber = i + 1;
      const status = await getReplStatusFromInstance({
        ...params,
        instanceNumber,
      });

      const member = await findReplMemberByInstanceNumber({
        instanceNumber,
        mongoRunConfig,
        status,
      });

      // Return the status and the member
      return {status, member};
    })
  );

  // Create the status response by combining information from all members
  const status: ReplicaSetStatusResponse = {
    raw: statuses[0].status.raw,
    rawAll: statuses.map(status => status.status.raw),
    set: statuses[0].status.set,
    date: statuses[0].status.date,
    members: statuses
      .map(status => status.member)
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

export async function getReplicaSetStatus(params: GetReplicaSetStatusParams) {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    printStatus = false,
    ping,
  } = params;

  const clusterAdminUser = await findClusterAdminUser({
    users: mongoRunConfig.users,
    isRequired: mongoRunConfig.authorization !== 'disabled',
  });

  let status: ReplicaSetStatusResponse | undefined;
  if (ping === 'all') {
    status = await getStatusFromAllMembers({
      ...params,
      authUser: clusterAdminUser,
    });
  } else if (ping === 'repl') {
    status = await getReplStatusFromReplicaSet({
      ...params,
      authUser: clusterAdminUser,
    });
  } else if (!isNaN(Number(ping))) {
    status = await getReplStatusFromInstance({
      ...params,
      authUser: clusterAdminUser,
      instanceNumber: Number(ping),
    });
  }

  assert.ok(status, 'Status not found');

  if (printStatus) {
    printStatusToLogger(status, logger);
  }

  return status;
}
