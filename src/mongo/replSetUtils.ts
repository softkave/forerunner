import {IForeLogger} from '../utils/exports.js';
import {compileHostnames, MongoRunConfig} from './index.js';
import {
  getReplicaSetStatus,
  ReplicaSetStatusMember,
  ReplicaSetStatusResponse,
} from './replicaSetStatus.js';

export async function findReplMemberByInstanceNumber(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  status: ReplicaSetStatusResponse;
}): Promise<ReplicaSetStatusMember | undefined> {
  const {instanceNumber, mongoRunConfig, status} = params;

  const hostnames = compileHostnames({
    hostnames: mongoRunConfig.hostnames[instanceNumber - 1],
    bindLocalhost: mongoRunConfig.bindLocalhost ?? false,
  });
  return status.members.find(member =>
    hostnames.some(hostname => member.name.includes(hostname))
  );
}

/**
 * Get replica set member status for an instance number.
 * Matches instance by comparing bind IPs from mongod config with member hostname.
 */
export async function getReplMemberByInstanceNumber(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}): Promise<ReplicaSetStatusMember | undefined> {
  const {instanceNumber, mongoRunConfig, logger} = params;

  const status = await getReplicaSetStatus({
    ping: instanceNumber,
    mongoRunConfig,
    logger,
  });

  return await findReplMemberByInstanceNumber({
    instanceNumber,
    mongoRunConfig,
    status,
  });
}

export async function getReplPrimaryMember(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}): Promise<ReplicaSetStatusMember | undefined> {
  const {mongoRunConfig, logger} = params;

  const status = await getReplicaSetStatus({
    ping: 'all',
    mongoRunConfig,
    logger,
  });
  return status.members.find(member => member.stateStr === 'PRIMARY');
}
