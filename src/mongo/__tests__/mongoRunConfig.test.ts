import {describe, expect, test} from 'vitest';
import {mongoRunConfigSchema} from '../mongoRunConfig.js';

describe('mongoRunConfigSchema', () => {
  const baseConfig = {
    workingDir: '/tmp/forerunner-mongo',
    mongoVersion: '8.2.3',
    caConfig: {
      days: 3650,
      subject: {
        C: 'US',
        ST: 'Delaware',
        L: 'Dover',
        O: 'Test',
        CN: 'Test CA',
      },
    },
    hostnames: ['localhost', 'localhost', 'localhost'],
    ports: [27017, 27018, 27019],
    replicaSetName: 'test-rs',
    authorization: 'enabled' as const,
  };

  test('requires both admin and cluster-admin users when authorization is enabled', () => {
    const result = mongoRunConfigSchema.safeParse({
      ...baseConfig,
      users: [
        {
          username: 'admin',
          password: 'secret',
          roles: [{role: 'userAdminAnyDatabase', db: 'admin'}],
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(issue =>
          issue.message.includes('cluster admin')
        )
      ).toBe(true);
    }
  });

  test('accepts configs with a single user that has admin and cluster-admin roles when authorization is enabled', () => {
    const result = mongoRunConfigSchema.safeParse({
      ...baseConfig,
      users: [
        {
          username: 'admin',
          password: 'secret',
          roles: [
            {role: 'userAdminAnyDatabase', db: 'admin'},
            {role: 'readWriteAnyDatabase', db: 'admin'},
            {role: 'clusterAdmin', db: 'admin'},
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  test('accepts configs with separate admin and cluster-admin users when authorization is enabled', () => {
    const result = mongoRunConfigSchema.safeParse({
      ...baseConfig,
      users: [
        {
          username: 'admin',
          password: 'secret',
          roles: [{role: 'userAdminAnyDatabase', db: 'admin'}],
        },
        {
          username: 'cluster-admin',
          password: 'secret',
          roles: [{role: 'clusterAdmin', db: 'admin'}],
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
