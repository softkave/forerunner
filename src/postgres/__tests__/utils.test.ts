import {describe, expect, test} from 'vitest';
import type {PostgresRunConfig} from '../postgresRunConfig.js';
import {
  generatePgHbaConfContent,
  generatePgHbaEntriesForUser,
  getPgHbaTcpAddresses,
  getPostgresConnectionSslModesToTry,
  getPostgresDataDirPath,
  getPostgresMajorVersion,
  getPostgresVolumeMountPath,
  pgHbaConfNeedsUpdate,
  pgHbaRequiresSSL,
  setPgHbaRequireSSL,
  setPgHbaToScram,
  setPgHbaToTrust,
  setPostgresConfPasswordEncryption,
  setPostgresConfSSL,
} from '../utils.js';

describe('generatePgHbaEntriesForUser', () => {
  test('with no databases and both connection types, generates host and local for "all"', () => {
    const out = generatePgHbaEntriesForUser({
      username: 'alice',
      databases: undefined,
      authMethod: 'scram-sha-256',
    });
    expect(out).toContain('host all alice 127.0.0.1/32 scram-sha-256');
    expect(out).toContain('host all alice ::1/128 scram-sha-256');
    expect(out).toContain('host all alice 192.168.65.1/32 scram-sha-256');
    expect(out).toContain('local all alice scram-sha-256');
  });

  test('with specific databases, generates entries per database', () => {
    const out = generatePgHbaEntriesForUser({
      username: 'bob',
      databases: ['db1', 'db2'],
      authMethod: 'trust',
    });
    expect(out).toContain('host db1 bob 127.0.0.1/32 trust');
    expect(out).toContain('host db2 bob 127.0.0.1/32 trust');
    expect(out).toContain('local db1 bob trust');
    expect(out).toContain('local db2 bob trust');
  });

  test('with connectionTypes tcp only, no local entries', () => {
    const out = generatePgHbaEntriesForUser({
      username: 'carol',
      databases: undefined,
      authMethod: 'scram-sha-256',
      connectionTypes: ['tcp'],
    });
    expect(out).toContain('host all carol 127.0.0.1/32 scram-sha-256');
    expect(out).not.toContain('local all carol');
  });

  test('with connectionTypes local only, no host entries', () => {
    const out = generatePgHbaEntriesForUser({
      username: 'dave',
      databases: ['mydb'],
      authMethod: 'trust',
      connectionTypes: ['local'],
    });
    expect(out).toContain('local mydb dave trust');
    expect(out).not.toContain('127.0.0.1');
  });

  test('with requireSSL true, uses hostssl', () => {
    const out = generatePgHbaEntriesForUser({
      username: 'eve',
      databases: undefined,
      authMethod: 'scram-sha-256',
      requireSSL: true,
    });
    expect(out).toContain('hostssl all eve 127.0.0.1/32 scram-sha-256');
    expect(out).not.toContain('host all eve');
  });

  test('with discoverability global, allows all IPv4 and IPv6 clients', () => {
    const out = generatePgHbaEntriesForUser({
      username: 'frank',
      databases: undefined,
      authMethod: 'scram-sha-256',
      requireSSL: true,
      discoverability: 'global',
    });
    expect(out).toContain('hostssl all frank 0.0.0.0/0 scram-sha-256');
    expect(out).toContain('hostssl all frank ::/0 scram-sha-256');
  });

  test('with discoverability local, does not allow all clients', () => {
    const out = generatePgHbaEntriesForUser({
      username: 'grace',
      databases: undefined,
      authMethod: 'scram-sha-256',
      discoverability: 'local',
    });
    expect(out).not.toContain('0.0.0.0/0');
    expect(out).not.toContain('::/0');
  });
});

describe('getPgHbaTcpAddresses', () => {
  test('local includes docker bridge ranges only', () => {
    expect(getPgHbaTcpAddresses('local')).toEqual([
      '127.0.0.1/32',
      '::1/128',
      '172.17.0.0/16',
      '192.168.65.1/32',
    ]);
  });

  test('global adds all-address CIDRs', () => {
    expect(getPgHbaTcpAddresses('global')).toContain('0.0.0.0/0');
    expect(getPgHbaTcpAddresses('global')).toContain('::/0');
  });
});

describe('generatePgHbaConfContent', () => {
  test('includes both IPv4 and IPv6 host entries per user', () => {
    const content = generatePgHbaConfContent({
      authorization: 'enabled',
      ssl: 'disabled',
      discoverability: 'local',
      users: [{username: 'alice', password: 'secret'}],
    } as PostgresRunConfig);

    expect(content).toContain('host all alice 127.0.0.1/32 scram-sha-256');
    expect(content).toContain('host all alice ::1/128 scram-sha-256');
  });
});

describe('pgHbaConfNeedsUpdate', () => {
  test('returns false when current already has all expected lines', () => {
    const expected =
      'host all alice 127.0.0.1/32 scram-sha-256\nhost all alice ::1/128 scram-sha-256\n';
    expect(pgHbaConfNeedsUpdate(expected, expected)).toBe(false);
  });

  test('returns true when IPv6 entries are missing from current', () => {
    const current = 'host all alice 127.0.0.1/32 scram-sha-256\n';
    const expected =
      'host all alice 127.0.0.1/32 scram-sha-256\nhost all alice ::1/128 scram-sha-256\n';
    expect(pgHbaConfNeedsUpdate(current, expected)).toBe(true);
  });

  test('returns true when IPv4 entries are missing from current', () => {
    const current = 'host all alice ::1/128 scram-sha-256\n';
    const expected =
      'host all alice 127.0.0.1/32 scram-sha-256\nhost all alice ::1/128 scram-sha-256\n';
    expect(pgHbaConfNeedsUpdate(current, expected)).toBe(true);
  });

  test('returns false when expected is empty', () => {
    expect(pgHbaConfNeedsUpdate('host all all 127.0.0.1/32 trust', '')).toBe(
      false
    );
  });
});

describe('setPgHbaToScram', () => {
  test('replaces local trust with scram-sha-256', () => {
    const input = 'local   all   all   trust';
    expect(setPgHbaToScram(input)).toContain('scram-sha-256');
    expect(setPgHbaToScram(input)).not.toContain('trust');
  });

  test('replaces host trust with scram-sha-256', () => {
    const input = 'host all all 127.0.0.1/32 trust';
    expect(setPgHbaToScram(input)).toContain('scram-sha-256');
  });
});

describe('setPgHbaToTrust', () => {
  test('replaces local scram-sha-256 with trust', () => {
    const input = 'local   all   all   scram-sha-256';
    expect(setPgHbaToTrust(input)).toContain('trust');
    expect(setPgHbaToTrust(input)).not.toContain('scram-sha-256');
  });
});

describe('setPgHbaRequireSSL', () => {
  test('replaces host with hostssl', () => {
    const input = 'host all alice 127.0.0.1/32 scram-sha-256';
    expect(setPgHbaRequireSSL(input)).toContain('hostssl');
    expect(setPgHbaRequireSSL(input)).not.toMatch(/^host\s/);
  });
});

describe('pgHbaRequiresSSL', () => {
  test('returns true when content has hostssl', () => {
    expect(pgHbaRequiresSSL('hostssl all all 0.0.0.0/0 scram-sha-256')).toBe(
      true
    );
  });

  test('returns false when only host entries', () => {
    expect(pgHbaRequiresSSL('host all all 127.0.0.1/32 trust')).toBe(false);
  });
});

describe('setPostgresConfPasswordEncryption', () => {
  test('adds password_encryption when missing', () => {
    const out = setPostgresConfPasswordEncryption("listen_addresses = '*'");
    expect(out).toContain('password_encryption = scram-sha-256');
  });

  test('replaces existing password_encryption', () => {
    const out = setPostgresConfPasswordEncryption(
      'password_encryption = md5\nlisten = 5432'
    );
    expect(out).toContain('password_encryption = scram-sha-256');
    expect(out).not.toContain('password_encryption = md5');
  });

  test('leaves already scram-sha-256 unchanged', () => {
    const input = 'password_encryption = scram-sha-256';
    expect(setPostgresConfPasswordEncryption(input)).toBe(input);
  });
});

describe('setPostgresConfSSL', () => {
  test('adds ssl = on and cert paths when missing', () => {
    const out = setPostgresConfSSL(
      "listen_addresses = '*'",
      '/path/cert.pem',
      '/path/key.pem',
      '/path/ca.pem'
    );
    expect(out).toContain('ssl = on');
    expect(out).toContain("ssl_cert_file = '/path/cert.pem'");
    expect(out).toContain("ssl_key_file = '/path/key.pem'");
    expect(out).toContain("ssl_ca_file = '/path/ca.pem'");
  });

  test('replaces existing ssl = off with ssl = on', () => {
    const out = setPostgresConfSSL(
      'ssl = off',
      '/c/c.pem',
      '/c/k.pem',
      '/c/ca.pem'
    );
    expect(out).toContain('ssl = on');
  });
});

describe('getPostgresMajorVersion', () => {
  test('parses major version from semver-like strings', () => {
    expect(getPostgresMajorVersion('18')).toBe(18);
    expect(getPostgresMajorVersion('18.4')).toBe(18);
    expect(getPostgresMajorVersion('17.2')).toBe(17);
  });
});

describe('getPostgresVolumeMountPath', () => {
  test('uses parent directory for PostgreSQL 18+', () => {
    expect(getPostgresVolumeMountPath('18')).toBe('/var/lib/postgresql');
    expect(getPostgresVolumeMountPath('19.0')).toBe('/var/lib/postgresql');
  });

  test('uses data directory for PostgreSQL 17 and below', () => {
    expect(getPostgresVolumeMountPath('17')).toBe('/var/lib/postgresql/data');
    expect(getPostgresVolumeMountPath('16.4')).toBe('/var/lib/postgresql/data');
  });
});

describe('getPostgresDataDirPath', () => {
  test('uses versioned docker subdirectory for PostgreSQL 18+', () => {
    expect(getPostgresDataDirPath('18')).toBe('/var/lib/postgresql/18/docker');
    expect(getPostgresDataDirPath('19.1')).toBe(
      '/var/lib/postgresql/19/docker'
    );
  });

  test('uses legacy data directory for PostgreSQL 17 and below', () => {
    expect(getPostgresDataDirPath('17')).toBe('/var/lib/postgresql/data');
  });
});

describe('getPostgresConnectionSslModesToTry', () => {
  test('returns non-SSL only when ssl is disabled', () => {
    const config = {ssl: 'disabled'} as PostgresRunConfig;
    expect(getPostgresConnectionSslModesToTry(config)).toEqual([false]);
  });

  test('tries non-SSL then SSL when ssl is enabled', () => {
    const config = {ssl: 'enabled'} as PostgresRunConfig;
    expect(getPostgresConnectionSslModesToTry(config)).toEqual([false, true]);
  });

  test('returns SSL only when requireSsl is set', () => {
    const config = {ssl: 'enabled'} as PostgresRunConfig;
    expect(
      getPostgresConnectionSslModesToTry(config, {requireSsl: true})
    ).toEqual([true]);
  });
});
