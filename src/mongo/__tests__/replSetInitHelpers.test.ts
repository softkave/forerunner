import {describe, expect, test} from 'vitest';
import {
  buildReplicaSetInitiateScript,
  buildReplicaSetReconfigScript,
  getMongoshErrorMessage,
  isMongoAlreadyInitializedError,
  isMongoAuthenticationFailedError,
  isMongoAuthProbeUnavailableError,
  isMongoNotYetInitializedError,
  isMongoUnauthorizedError,
  kMongoErrorAlreadyInitialized,
  kMongoErrorNameAlreadyInitialized,
  kMongoErrorNameNotYetInitialized,
  kMongoErrorNotYetInitialized,
  parseReplicaSetMembersOutput,
  replicaSetMembersMatch,
} from '../replSetInitHelpers.js';

describe('replSetInitHelpers', () => {
  test('isMongoNotYetInitializedError matches code, codeName, and message', () => {
    expect(
      isMongoNotYetInitializedError(
        'MongoServerError: no replset config has been received'
      )
    ).toBe(true);
    expect(
      isMongoNotYetInitializedError(
        `MongoServerError: ${kMongoErrorNameNotYetInitialized}`
      )
    ).toBe(true);
    expect(
      isMongoNotYetInitializedError(
        `MongoServerError: { "code" : ${kMongoErrorNotYetInitialized} }`
      )
    ).toBe(true);
    expect(
      isMongoNotYetInitializedError('MongoServerError: connection refused')
    ).toBe(false);
  });

  test('isMongoAlreadyInitializedError matches code, codeName, and message', () => {
    expect(
      isMongoAlreadyInitializedError('MongoServerError: already initialized')
    ).toBe(true);
    expect(
      isMongoAlreadyInitializedError(
        `MongoServerError: ${kMongoErrorNameAlreadyInitialized}`
      )
    ).toBe(true);
    expect(
      isMongoAlreadyInitializedError(
        `MongoServerError: { "code" : ${kMongoErrorAlreadyInitialized} }`
      )
    ).toBe(true);
    expect(
      isMongoAlreadyInitializedError(
        'MongoServerError: no replset config has been received'
      )
    ).toBe(false);
  });

  test('isMongoUnauthorizedError matches auth failures', () => {
    expect(
      isMongoUnauthorizedError(
        'MongoServerError: not authorized on admin to execute command'
      )
    ).toBe(true);
    expect(isMongoUnauthorizedError('MongoServerError: Unauthorized')).toBe(
      true
    );
    expect(isMongoUnauthorizedError('MongoServerError: { "code" : 13 }')).toBe(
      true
    );
    expect(
      isMongoUnauthorizedError('MongoServerError: Authentication failed')
    ).toBe(false);
  });

  test('isMongoAuthenticationFailedError matches SCRAM auth failures', () => {
    expect(
      isMongoAuthenticationFailedError(
        'MongoServerError: Authentication failed.'
      )
    ).toBe(true);
    expect(
      isMongoAuthenticationFailedError('MongoServerError: not authorized')
    ).toBe(false);
  });

  test('isMongoAuthProbeUnavailableError covers unauthorized and auth failed', () => {
    expect(
      isMongoAuthProbeUnavailableError('MongoServerError: not authorized')
    ).toBe(true);
    expect(
      isMongoAuthProbeUnavailableError(
        'MongoServerError: Authentication failed'
      )
    ).toBe(true);
    expect(
      isMongoAuthProbeUnavailableError('MongoServerError: connection refused')
    ).toBe(false);
  });

  test('getMongoshErrorMessage includes stderr from exec errors', () => {
    const err = Object.assign(new Error('Command failed'), {
      stderr: 'MongoServerError: already initialized',
    });
    expect(getMongoshErrorMessage(err)).toContain('already initialized');
  });

  test('buildReplicaSetInitiateScript handles AlreadyInitialized', () => {
    const script = buildReplicaSetInitiateScript({
      _id: 'rs0',
      members: [{_id: 0, host: 'host:27017'}],
    });
    expect(script).toContain('system.replset.findOne()');
    expect(script).toContain(`e.code == ${kMongoErrorAlreadyInitialized}`);
    expect(script).toContain(`'${kMongoErrorNameAlreadyInitialized}'`);
    expect(script).toContain('"rs0"');
  });

  test('replicaSetMembersMatch compares member ids and hosts', () => {
    const expected = [
      {_id: 0, host: 'mongo-1.dev.local:27017'},
      {_id: 1, host: 'mongo-2.dev.local:27018'},
    ];
    expect(
      replicaSetMembersMatch(expected, [
        {_id: 0, host: 'mongo-1.dev.local:27017'},
        {_id: 1, host: 'mongo-2.dev.local:27018'},
      ])
    ).toBe(true);
    expect(
      replicaSetMembersMatch(expected, [
        {_id: 0, host: 'mongo-1.dev.local:27099'},
        {_id: 1, host: 'mongo-2.dev.local:27018'},
      ])
    ).toBe(false);
  });

  test('parseReplicaSetMembersOutput parses mongosh JSON output', () => {
    expect(
      parseReplicaSetMembersOutput(
        '[{"_id":0,"host":"mongo-1.dev.local:27017"}]\n'
      )
    ).toEqual([{_id: 0, host: 'mongo-1.dev.local:27017'}]);
    expect(parseReplicaSetMembersOutput('[]')).toEqual([]);
  });

  test('buildReplicaSetReconfigScript uses force reconfig', () => {
    const script = buildReplicaSetReconfigScript({
      _id: 'rs0',
      members: [{_id: 0, host: 'host:27017'}],
    });
    expect(script).toContain('rs.reconfig(config, {force: true})');
  });
});
