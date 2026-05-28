import {describe, expect, test} from 'vitest';
import {
  generatePgHbaEntriesForUser,
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
