import {describe, expect, test, vi} from 'vitest';
import {PostgresRunConfig} from '../postgresRunConfig.js';
import {
  buildPostgresConnectionUri,
  getPostgresConnectionHost,
} from '../printPostgresUri.js';
import * as getLocalIPModule from '../../utils/getLocalIP.js';

const baseConfig: PostgresRunConfig = {
  workingDir: '.',
  port: 5432,
  authorization: 'disabled',
  ssl: 'disabled',
  postgresVersion: '18',
  containerName: 'test-postgres',
  volumeName: 'test-postgres',
  keep: false,
  discoverability: 'local',
};

describe('buildPostgresConnectionUri', () => {
  test('returns URI without credentials by default', () => {
    const uri = buildPostgresConnectionUri({postgresRunConfig: baseConfig});
    expect(uri).toBe('postgresql://127.0.0.1:5432/postgres');
  });

  test('includes credentials when username is provided', () => {
    const uri = buildPostgresConnectionUri({
      postgresRunConfig: {
        ...baseConfig,
        users: [{username: 'app', password: 'secret'}],
      },
      username: 'app',
      password: 'secret',
    });
    expect(uri).toBe('postgresql://app:secret@127.0.0.1:5432/postgres');
  });

  test('includes database when provided', () => {
    const uri = buildPostgresConnectionUri({
      postgresRunConfig: baseConfig,
      database: 'mydb',
    });
    expect(uri).toBe('postgresql://127.0.0.1:5432/mydb');
  });

  test('includes ssl params when ssl is enabled', () => {
    const uri = buildPostgresConnectionUri({
      postgresRunConfig: {
        ...baseConfig,
        ssl: 'enabled',
      },
    });
    expect(uri).toContain('sslmode=require');
    expect(uri).toContain('sslrejectunauthorized=false');
  });

  test('getPostgresConnectionHost uses loopback for local discoverability', () => {
    expect(getPostgresConnectionHost('local')).toBe('127.0.0.1');
  });

  test('getPostgresConnectionHost uses machine IPv4 for global discoverability', () => {
    vi.spyOn(getLocalIPModule, 'getLocalIP').mockReturnValue({
      ipv4: ['192.168.1.42'],
      ipv6: [],
    });
    expect(getPostgresConnectionHost('global')).toBe('192.168.1.42');
  });

  test('buildPostgresConnectionUri uses machine address when discoverability is global', () => {
    vi.spyOn(getLocalIPModule, 'getLocalIP').mockReturnValue({
      ipv4: ['10.0.0.5'],
      ipv6: [],
    });
    const uri = buildPostgresConnectionUri({
      postgresRunConfig: {
        ...baseConfig,
        discoverability: 'global',
      },
    });
    expect(uri).toBe('postgresql://10.0.0.5:5432/postgres');
  });
});
