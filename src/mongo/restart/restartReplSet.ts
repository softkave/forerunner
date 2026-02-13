import pRetry from 'p-retry';
import {waitTimeout} from 'softkave-js-utils';
import {ConsoleForeLogger} from '../../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../../utils/foreLogger/types.js';
import {
  closeMongoClient,
  getMongoClientForReplicaSet,
  GetMongoClientForReplicaSetParams,
} from '../connection.js';
import {getInstanceRunName} from '../constants.js';
import {MongoRunConfig} from '../mongoRunConfig.js';
import {
  getReplicaSetStatus,
  type ReplicaSetStatusMember,
} from '../replicaSetStatus.js';
import {
  getReplMemberByInstanceNumber,
  getReplPrimaryMember,
} from '../replSetUtils.js';
import {startMongodInstance} from '../startMongodInstances.js';
import {stopMongodInstance} from '../stopMongodInstances.js';
import {findClusterAdminUser} from '../user/findUtils.js';
import {compileHostnames} from '../utils.js';

/**
 * Step down primary member using replSetStepDown command.
 * Waits for secondary to catch up before stepping down (unless force=true).
 * Retries on failure with configurable retry count.
 * Requires cluster admin user for execution.
 */
export async function stepDownPrimary(
  params: {
    force?: boolean;
    stepDownSeconds?: number;
    secondaryCatchUpPeriodSecs?: number;
    retries?: number;
  } & GetMongoClientForReplicaSetParams
): Promise<void> {
  const {
    mongoRunConfig,
    logger = new ConsoleForeLogger({silent: true}),
    force = false,
    stepDownSeconds = 120,
    secondaryCatchUpPeriodSecs = force ? 0 : 30,
    retries = 3,
  } = params;

  if (stepDownSeconds <= secondaryCatchUpPeriodSecs) {
    throw new Error(
      `stepDownSeconds (${stepDownSeconds}) must be greater than secondaryCatchUpPeriodSecs (${secondaryCatchUpPeriodSecs})`
    );
  }

  const clusterAdminUser =
    mongoRunConfig.authorization !== 'disabled'
      ? findClusterAdminUser({
          users: mongoRunConfig.users,
          isRequired: true,
        })
      : undefined;

  const client = await getMongoClientForReplicaSet({
    ...params,
    authUser: clusterAdminUser,
  });

  await pRetry(
    async () => {
      try {
        const adminDb = client.db('admin');
        await adminDb.command({
          replSetStepDown: stepDownSeconds,
          secondaryCatchUpPeriodSecs,
          force,
        });

        logger.log(
          `StepDown command sent successfully (force: ${force}, stepDownSeconds: ${stepDownSeconds})`
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.log(`StepDown command failed: ${errorMessage}`);
        throw error;
      } finally {
        await closeMongoClient(client, params);
      }
    },
    {
      retries,
      onFailedAttempt: ({error, attemptNumber}) => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.log(
          `StepDown attempt ${attemptNumber}/${retries} failed: ${errorMessage}`
        );
      },
    }
  );
}

/**
 * Restart a single replica set member.
 * Stops instance, starts it, waits for listening, then waits for PRIMARY/SECONDARY state.
 * Used as building block for rolling restarts.
 */
export async function restartReplicaSetMember(params: {
  instanceNumber: number;
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  force?: boolean;
  waitUntilListening?: boolean;
  waitUntilReplicaSetReady?: boolean;
}): Promise<void> {
  const {
    instanceNumber,
    mongoRunConfig,
    logger,
    force = false,
    waitUntilListening = true,
    waitUntilReplicaSetReady = true,
  } = params;

  const instanceRunName = getInstanceRunName(instanceNumber);
  logger.log(`Restarting replica set member: ${instanceRunName}`);

  logger.log(`Stopping ${instanceRunName}...`);
  await stopMongodInstance({
    instanceNumber,
    mongoRunConfig,
    logger,
    force,
  });

  logger.log(`Starting ${instanceRunName}...`);
  await startMongodInstance({
    instanceNumber,
    mongoRunConfig,
    logger,
    waitUntilListening,
    waitUntilReplicaSetReady,
  });

  logger.log(`Successfully restarted ${instanceRunName}`);
}

/**
 * Get instance number from member name by matching bind IPs
 */
async function getInstanceNumberFromMember(
  member: ReplicaSetStatusMember,
  mongoRunConfig: MongoRunConfig
): Promise<number | undefined> {
  for (let i = 1; i <= mongoRunConfig.instancePorts.length; i++) {
    const hostnames = compileHostnames({
      hostnames: mongoRunConfig.instancesHostnames[i - 1],
      bindLocalhost: mongoRunConfig.bindLocalhost ?? false,
    });
    if (hostnames.some(hostname => member.name.includes(hostname))) {
      return i;
    }
  }
  return undefined;
}
async function getNextNonPrimaryMember(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  ignoredInstanceNumbers?: Set<number>;
}): Promise<{member?: ReplicaSetStatusMember; instanceNumber?: number}> {
  const {mongoRunConfig, logger, ignoredInstanceNumbers} = params;

  const status = await getReplicaSetStatus({
    ping: 'all',
    mongoRunConfig,
    logger,
  });

  let memberToRestart: ReplicaSetStatusMember | undefined;
  let instanceToRestart: number | undefined;

  for (const member of status.members) {
    if (member.stateStr !== 'PRIMARY') {
      // Not primary
      const instanceNumber = await getInstanceNumberFromMember(
        member,
        mongoRunConfig
      );
      if (instanceNumber && !ignoredInstanceNumbers?.has(instanceNumber)) {
        memberToRestart = member;
        instanceToRestart = instanceNumber;
        break;
      }
    }
  }

  return {member: memberToRestart, instanceNumber: instanceToRestart};
}

async function verifyMemberHealthAfterRestart(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  instanceNumber: number;
}): Promise<boolean> {
  const {mongoRunConfig, logger, instanceNumber} = params;

  const member = await getReplMemberByInstanceNumber({
    instanceNumber,
    mongoRunConfig,
    logger,
  });

  const isHealthy = !!member && member.health === 'HEALTHY';
  if (!isHealthy) {
    logger.log(
      `Warning: Member ${instanceNumber} is not healthy after restart (health: ${member?.health ?? 'unknown'})`
    );
  }

  return isHealthy;
}

async function restartNextNonPrimaryMember(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  force?: boolean;
  restartedInstances: Set<number>;
}): Promise<boolean> {
  const {mongoRunConfig, logger, force, restartedInstances} = params;

  // Find a non-primary member that hasn't been restarted
  const {member: memberToRestart, instanceNumber: instanceToRestart} =
    await getNextNonPrimaryMember({
      mongoRunConfig,
      logger,
      ignoredInstanceNumbers: restartedInstances,
    });

  if (!memberToRestart || !instanceToRestart) {
    // All non-primary members have been restarted, break to handle primary
    return false;
  }

  logger.log(
    `Restarting non-primary member: instance ${instanceToRestart} (${memberToRestart.name})`
  );

  await restartReplicaSetMember({
    instanceNumber: instanceToRestart,
    mongoRunConfig,
    logger,
    force,
  });

  await verifyMemberHealthAfterRestart({
    mongoRunConfig,
    logger,
    instanceNumber: instanceToRestart,
  });

  restartedInstances.add(instanceToRestart);
  logger.log(`Non-primary member ${memberToRestart.name} restarted`);

  return true;
}

async function restartNonPrimaryMembers(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  force?: boolean;
  restartedInstances: Set<number>;
}): Promise<void> {
  const {mongoRunConfig, logger, force, restartedInstances} = params;

  while (true) {
    const restarted = await restartNextNonPrimaryMember({
      mongoRunConfig,
      logger,
      force,
      restartedInstances,
    });

    if (!restarted) {
      // No more non-primary members to restart, break to handle primary
      break;
    }
  }

  logger.log('All non-primary members restarted');
}

async function waitForNewPrimary(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  previousPrimary: ReplicaSetStatusMember;
  electionTimeoutMs?: number;
}): Promise<boolean> {
  const {
    mongoRunConfig,
    logger,
    previousPrimary,
    electionTimeoutMs = 30_000, // 30 seconds default
  } = params;

  logger.log('Waiting for new primary to be elected...');

  let newPrimaryElected = false;
  const electionStartTime = Date.now();

  while (Date.now() - electionStartTime < electionTimeoutMs) {
    const currentStatus = await getReplicaSetStatus({
      ping: 'repl',
      mongoRunConfig,
      logger,
    });

    const newPrimary = currentStatus.members.find(
      member =>
        member.stateStr === 'PRIMARY' && member.name !== previousPrimary.name
    );

    if (newPrimary && newPrimary.health === 'HEALTHY') {
      logger.log(`New primary elected: ${newPrimary.name}`);
      newPrimaryElected = true;
      break;
    }

    await waitTimeout(1000);
  }

  return newPrimaryElected;
}

async function restartPrimaryMember(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  force?: boolean;
  stepDownSeconds?: number;
  secondaryCatchUpPeriodSecs?: number;
  restartedInstances: Set<number>;
}): Promise<void> {
  const {
    mongoRunConfig,
    logger,
    force,
    stepDownSeconds,
    secondaryCatchUpPeriodSecs,
    restartedInstances,
  } = params;

  const primaryMember = await getReplPrimaryMember({
    mongoRunConfig,
    logger,
  });
  if (!primaryMember) {
    throw new Error('No primary member found in replica set');
  }

  const primaryInstanceNumber = await getInstanceNumberFromMember(
    primaryMember,
    mongoRunConfig
  );
  if (!primaryInstanceNumber) {
    throw new Error('Could not determine instance number for primary member');
  }

  if (restartedInstances.has(primaryInstanceNumber)) {
    logger.log('Primary has already been restarted');
    return;
  }

  logger.log(
    `Stepping down primary: instance ${primaryInstanceNumber} (${primaryMember.name})`
  );

  await stepDownPrimary({
    mongoRunConfig,
    logger,
    force,
    stepDownSeconds,
    secondaryCatchUpPeriodSecs,
  });

  // Wait for new primary to be elected
  logger.log('Waiting for new primary to be elected...');
  const newPrimaryElected = await waitForNewPrimary({
    mongoRunConfig,
    logger,
    previousPrimary: primaryMember,
  });
  if (!newPrimaryElected) {
    throw new Error('New primary was not elected within timeout period');
  }

  logger.log(
    `Restarting stepped-down member: instance ${primaryInstanceNumber}`
  );

  await restartReplicaSetMember({
    instanceNumber: primaryInstanceNumber,
    mongoRunConfig,
    logger,
    force,
  });

  await verifyMemberHealthAfterRestart({
    mongoRunConfig,
    logger,
    instanceNumber: primaryInstanceNumber,
  });

  restartedInstances.add(primaryInstanceNumber);
  logger.log(`Primary member ${primaryMember.name} restarted`);
}

async function verifyAllMembersAreHealthy(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
}): Promise<void> {
  const {mongoRunConfig, logger} = params;

  logger.log('Verifying all members are healthy...');
  const status = await getReplicaSetStatus({
    ping: 'all',
    mongoRunConfig,
    logger,
  });

  for (const member of status.members) {
    if (member.health !== 'HEALTHY') {
      logger.log(
        `Warning: Member ${member.name} is not healthy (health: ${member.health}, state: ${member.stateStr})`
      );
    }
    if (member.state !== 1 && member.state !== 2) {
      logger.log(
        `Warning: Member ${member.name} is not in PRIMARY or SECONDARY state (state: ${member.stateStr})`
      );
    }
  }
}

/**
 * Orchestrate rolling restart of all replica set members.
 * Restarts secondaries first, then steps down and restarts primary.
 * Verifies member health after each restart and ensures new primary is elected.
 * Maintains replica set availability throughout the process.
 */
export async function restartReplicaSetMembersRolling(params: {
  mongoRunConfig: MongoRunConfig;
  logger: IForeLogger;
  force?: boolean;
  stepDownSeconds?: number;
  secondaryCatchUpPeriodSecs?: number;
}): Promise<void> {
  const {
    mongoRunConfig,
    logger,
    force = false,
    stepDownSeconds = 120,
    secondaryCatchUpPeriodSecs,
  } = params;

  logger.log('Starting rolling restart of replica set members');

  const restartedInstances = new Set<number>();

  // Restart all non-primary members first
  await restartNonPrimaryMembers({
    mongoRunConfig,
    logger,
    force,
    restartedInstances,
  });

  // Now handle the primary
  await restartPrimaryMember({
    mongoRunConfig,
    logger,
    force,
    stepDownSeconds,
    secondaryCatchUpPeriodSecs,
    restartedInstances,
  });

  await verifyAllMembersAreHealthy({
    mongoRunConfig,
    logger,
  });

  logger.log('Rolling restart completed successfully');
}
