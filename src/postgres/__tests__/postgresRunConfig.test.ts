import {describe, expect, test} from 'vitest';
import {
  getAuthUserFromConfig,
  PostgresRunConfig,
  postgresRunConfigSchema,
} from '../postgresRunConfig.js';

describe('postgresRunConfigSchema', () => {
  const baseConfig = {
    port: 5432,
    containerName: 'test-pg',
  };

  test('accepts minimal valid config and applies defaults', () => {
    const parsed = postgresRunConfigSchema.parse(baseConfig);
    expect(parsed.workingDir).toBe('.');
    expect(parsed.postgresVersion).toBe('18');
    expect(parsed.volumeName).toBe('test-pg');
    expect(parsed.keep).toBe(false);
    expect(parsed.authorization).toBe('disabled');
    expect(parsed.ssl).toBe('disabled');
    expect(parsed.discoverability).toBe('local');
  });

  test('when authorization is enabled, at least one user is required', () => {
    expect(() =>
      postgresRunConfigSchema.parse({
        ...baseConfig,
        authorization: 'enabled',
      })
    ).toThrow();
  });

  test('when authorization is enabled, all users must have a password', () => {
    expect(() =>
      postgresRunConfigSchema.parse({
        ...baseConfig,
        authorization: 'enabled',
        users: [{username: 'admin'}],
      })
    ).toThrow(/must have a password/);
  });

  test('when authorization is enabled with valid users, parses successfully', () => {
    const parsed = postgresRunConfigSchema.parse({
      ...baseConfig,
      authorization: 'enabled',
      users: [{username: 'admin', password: 'secret'}],
    });
    expect(parsed.authorization).toBe('enabled');
    expect(parsed.users).toHaveLength(1);
    expect(parsed.users![0].password).toBe('secret');
  });

  test('when ssl is enabled, caConfig is required', () => {
    expect(() =>
      postgresRunConfigSchema.parse({
        ...baseConfig,
        ssl: 'enabled',
      })
    ).toThrow(/caConfig is required/);
  });

  test('when ssl is enabled with caConfig, parses successfully', () => {
    const parsed = postgresRunConfigSchema.parse({
      ...baseConfig,
      ssl: 'enabled',
      caConfig: {
        days: 365,
        subject: {
          C: 'US',
          ST: 'CA',
          L: 'SF',
          O: 'Test',
          CN: 'Test CA',
        },
        outDir: '/tmp/certs',
        files: {
          key: 'ca.key.pem',
          cert: 'ca.crt.pem',
          csr: 'ca.csr.pem',
          chain: 'ca-chain.pem',
        },
      },
    });
    expect(parsed.ssl).toBe('enabled');
    expect(parsed.caConfig).toBeDefined();
  });

  test('user databases must exist in dbs array', () => {
    expect(() =>
      postgresRunConfigSchema.parse({
        ...baseConfig,
        dbs: ['mydb'],
        users: [
          {
            username: 'u1',
            password: 'p1',
            databases: ['nonexistent'],
          },
        ],
      })
    ).toThrow(/does not exist in the dbs array/);
  });

  test('user databases that exist in dbs array are accepted', () => {
    const parsed = postgresRunConfigSchema.parse({
      ...baseConfig,
      dbs: ['mydb', 'otherdb'],
      users: [
        {
          username: 'u1',
          password: 'p1',
          databases: ['mydb', 'otherdb'],
        },
      ],
    });
    expect(parsed.users![0].databases).toEqual(['mydb', 'otherdb']);
  });

  test('connectionTypes accepts tcp and local', () => {
    const parsed = postgresRunConfigSchema.parse({
      ...baseConfig,
      users: [
        {
          username: 'u1',
          password: 'p1',
          connectionTypes: ['tcp'],
        },
      ],
    });
    expect(parsed.users![0].connectionTypes).toEqual(['tcp']);
  });
});

describe('getAuthUserFromConfig', () => {
  test('returns undefined when no users', () => {
    const config: PostgresRunConfig = {
      workingDir: process.cwd(),
      port: 5432,
      containerName: 'c',
      volumeName: 'c',
      keep: false,
      authorization: 'disabled',
      ssl: 'disabled',
      postgresVersion: '18',
      discoverability: 'local',
    };
    expect(getAuthUserFromConfig(config)).toBeUndefined();
  });

  test('when authorization disabled, returns first user with optional password', () => {
    const config: PostgresRunConfig = {
      ...({
        workingDir: process.cwd(),
        port: 5432,
        containerName: 'c',
        volumeName: 'c',
        keep: false,
        authorization: 'disabled',
        ssl: 'disabled',
        postgresVersion: '18',
      } as PostgresRunConfig),
      users: [{username: 'admin', password: 'secret'}],
    };
    expect(getAuthUserFromConfig(config)).toEqual({
      username: 'admin',
      password: 'secret',
    });
  });

  test('when authorization enabled and postgres in users, returns postgres', () => {
    const config: PostgresRunConfig = {
      ...({
        workingDir: process.cwd(),
        port: 5432,
        containerName: 'c',
        volumeName: 'c',
        keep: false,
        authorization: 'enabled',
        ssl: 'disabled',
        postgresVersion: '18',
      } as PostgresRunConfig),
      users: [
        {username: 'admin', password: 'adminpw'},
        {username: 'postgres', password: 'superpw'},
      ],
    };
    expect(getAuthUserFromConfig(config)).toEqual({
      username: 'postgres',
      password: 'superpw',
    });
  });

  test('when authorization enabled and postgres not in users, returns first user', () => {
    const config: PostgresRunConfig = {
      ...({
        workingDir: process.cwd(),
        port: 5432,
        containerName: 'c',
        volumeName: 'c',
        keep: false,
        authorization: 'enabled',
        ssl: 'disabled',
        postgresVersion: '18',
      } as PostgresRunConfig),
      users: [{username: 'admin', password: 'adminpw'}],
    };
    expect(getAuthUserFromConfig(config)).toEqual({
      username: 'admin',
      password: 'adminpw',
    });
  });
});
