import {describe, expect, test} from 'vitest';
import {redisRunConfigSchema} from '../redisRunConfig.js';

describe('redisRunConfigSchema', () => {
  test('single: applies defaults', () => {
    const parsed = redisRunConfigSchema.parse({
      mode: 'single',
      containerName: 'redis-test',
    });
    expect(parsed.workingDir).toBe(process.cwd());
    expect(parsed.redisVersion).toBe('8.0.3');
    expect(parsed.discoverability).toBe('local');
    expect(parsed.auth).toBe('enabled');
    expect(parsed.tls).toBe('disabled');
    expect(parsed.keep).toBe(false);
    expect(parsed.persistence.aof).toBe('enabled');
  });

  test('global discoverability requires auth unless allowInsecureGlobal=true', () => {
    expect(() =>
      redisRunConfigSchema.parse({
        mode: 'single',
        containerName: 'redis-test',
        discoverability: 'global',
        auth: 'disabled',
      })
    ).toThrow(/allowInsecureGlobal/);

    const ok = redisRunConfigSchema.parse({
      mode: 'single',
      containerName: 'redis-test',
      discoverability: 'global',
      auth: 'disabled',
      allowInsecureGlobal: true,
    });
    expect(ok.discoverability).toBe('global');
    expect(ok.auth).toBe('disabled');
  });

  test('tls enabled requires tlsConfig.caConfig', () => {
    expect(() =>
      redisRunConfigSchema.parse({
        mode: 'single',
        containerName: 'redis-test',
        tls: 'enabled',
      })
    ).toThrow(/tlsConfig\.caConfig/);
  });

  test('cluster: defaults and minimum masters', () => {
    const parsed = redisRunConfigSchema.parse({mode: 'cluster'});
    expect(parsed.mode).toBe('cluster');
    if (parsed.mode !== 'cluster') {
      throw new Error('expected cluster mode');
    }
    expect(parsed.masters).toBe(3);
    expect(parsed.replicasPerMaster).toBe(1);
    expect(parsed.basePort).toBe(7000);
  });

  test('sentinel: quorum must be <= sentinels', () => {
    expect(() =>
      redisRunConfigSchema.parse({
        mode: 'sentinel',
        sentinels: 2,
        quorum: 3,
      })
    ).toThrow(/quorum/);
  });
});
