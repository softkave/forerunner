/** MongoDB error code when rs.status() runs before repl set config exists. */
export const kMongoErrorNotYetInitialized = 94;

/** MongoDB error code when rs.initiate() runs on an already-initialized node. */
export const kMongoErrorAlreadyInitialized = 23;

/** MongoDB error code for auth failures. */
export const kMongoErrorUnauthorized = 13;

export const kMongoErrorNameNotYetInitialized = 'NotYetInitialized';
export const kMongoErrorNameAlreadyInitialized = 'AlreadyInitialized';
export const kMongoErrorNameUnauthorized = 'Unauthorized';

export const kMongoErrorMessageNotYetInitialized =
  'no replset config has been received';
export const kMongoErrorMessageAlreadyInitialized = 'already initialized';

export function getMongoshErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const execErr = err as Error & {stderr?: string};
    return [err.message, execErr.stderr].filter(Boolean).join('\n');
  }
  return String(err);
}

function hasMongoErrorCode(message: string, code: number): boolean {
  return new RegExp(`["']code["']\\s*:\\s*${code}\\b`).test(message);
}

export function isMongoNotYetInitializedError(message: string): boolean {
  return (
    message.includes(kMongoErrorMessageNotYetInitialized) ||
    message.includes(kMongoErrorNameNotYetInitialized) ||
    hasMongoErrorCode(message, kMongoErrorNotYetInitialized)
  );
}

export function isMongoAlreadyInitializedError(message: string): boolean {
  return (
    message.includes(kMongoErrorMessageAlreadyInitialized) ||
    message.includes(kMongoErrorNameAlreadyInitialized) ||
    hasMongoErrorCode(message, kMongoErrorAlreadyInitialized)
  );
}

export function isMongoUnauthorizedError(message: string): boolean {
  return (
    message.includes('not authorized') ||
    message.includes(kMongoErrorNameUnauthorized) ||
    hasMongoErrorCode(message, kMongoErrorUnauthorized)
  );
}

/** Wrong/missing user during SCRAM auth (e.g. cluster-admin not created yet). */
export function isMongoAuthenticationFailedError(message: string): boolean {
  return message.includes('Authentication failed');
}

/**
 * Auth-related probe failure: credentials cannot read repl state.
 * Caller should try another credential (e.g. admin during bootstrap).
 */
export function isMongoAuthProbeUnavailableError(message: string): boolean {
  return (
    isMongoUnauthorizedError(message) ||
    isMongoAuthenticationFailedError(message)
  );
}

export type ReplicaSetMemberConfig = {_id: number; host: string};

/** Probe whether local.system.replset has a usable config document. */
export const kReplSetConfigProbeScript = `(() => {
  const doc = db.getSiblingDB('local').system.replset.findOne();
  return doc !== null && Array.isArray(doc.members) && doc.members.length > 0;
})()`;

/** Whether replSetGetStatus reports at least one PRIMARY member. */
export const kReplSetHasPrimaryScript = `JSON.stringify(
  db.adminCommand({replSetGetStatus: 1}).members.some(
    m => m.stateStr === 'PRIMARY'
  )
)`;

/** Read persisted replica set member hostnames from local.system.replset. */
export const kReplSetMembersReadScript = `JSON.stringify(
  (() => {
    const doc = db.getSiblingDB('local').system.replset.findOne();
    if (!doc || !Array.isArray(doc.members)) {
      return [];
    }
    return doc.members.map(m => ({_id: m._id, host: m.host}));
  })()
)`;

export function replicaSetMembersMatch(
  expected: ReplicaSetMemberConfig[],
  actual: ReplicaSetMemberConfig[]
): boolean {
  if (expected.length !== actual.length) {
    return false;
  }
  const actualById = new Map(actual.map(member => [member._id, member.host]));
  return expected.every(member => actualById.get(member._id) === member.host);
}

export function parseReplicaSetMembersOutput(
  stdout: string
): ReplicaSetMemberConfig[] {
  const parsed: unknown = JSON.parse(stdout.trim());
  if (!Array.isArray(parsed)) {
    throw new Error(`unexpected replset members output: ${stdout}`);
  }
  return parsed.map(member => {
    if (
      typeof member !== 'object' ||
      member === null ||
      typeof (member as {_id?: unknown})._id !== 'number' ||
      typeof (member as {host?: unknown}).host !== 'string'
    ) {
      throw new Error(
        `unexpected replset member entry: ${JSON.stringify(member)}`
      );
    }
    return member as ReplicaSetMemberConfig;
  });
}

export function buildReplicaSetReconfigScript(config: {
  _id: string;
  members: ReplicaSetMemberConfig[];
}): string {
  const configJson = JSON.stringify(config);
  return `(() => {
  const config = ${configJson};
  rs.reconfig(config, {force: true});
})()`;
}

export function buildReplicaSetInitiateScript(config: {
  _id: string;
  members: {_id: number; host: string}[];
}): string {
  const configJson = JSON.stringify(config);
  return `(() => {
  const existing = db.getSiblingDB('local').system.replset.findOne();
  if (existing) return;
  const config = ${configJson};
  try {
    rs.initiate(config);
  } catch (e) {
    if (
      e.code == ${kMongoErrorAlreadyInitialized} ||
      e.codeName === '${kMongoErrorNameAlreadyInitialized}'
    ) {
      return;
    }
    throw e;
  }
})()`;
}
