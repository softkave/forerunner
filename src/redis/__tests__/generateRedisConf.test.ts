import {describe, expect, test} from 'vitest';
import {redisRunConfigSchema} from '../redisRunConfig.js';
import {renderRedisConf, renderSentinelConf} from '../generateRedisConf.js';

describe('generateRedisConf', () => {
  test('renders requirepass and appendonly by default', () => {
    const cfg = redisRunConfigSchema.parse({
      mode: 'single',
      containerName: 'redis',
    });
    const conf = renderRedisConf({
      redisRunConfig: cfg,
      nodeName: 'redis',
      port: 6379,
      password: 'pw',
    });
    expect(conf).toContain('appendonly yes');
    expect(conf).toContain('requirepass pw');
    expect(conf).toContain('masterauth pw');
    expect(conf).toContain('port 6379');
  });

  test('cluster renders cluster directives', () => {
    const cfg = redisRunConfigSchema.parse({mode: 'cluster'});
    const conf = renderRedisConf({
      redisRunConfig: cfg,
      nodeName: 'redis-cluster-node-1',
      port: 7000,
      clusterEnabled: true,
      password: 'pw',
    });
    expect(conf).toContain('cluster-enabled yes');
    expect(conf).toContain('cluster-config-file nodes.conf');
    expect(conf).toContain('cluster-announce-hostname redis-cluster-node-1');
  });

  test('sentinel config includes monitor and auth-pass when password present', () => {
    const cfg = redisRunConfigSchema.parse({mode: 'sentinel'});
    const sent = renderSentinelConf({
      redisRunConfig: cfg,
      sentinelPort: 26379,
      masterName: 'mymaster',
      masterHost: 'redis-sentinel-master',
      masterPort: 6379,
      quorum: 2,
      downAfterMs: 5000,
      failoverTimeoutMs: 60000,
      password: 'pw',
    });
    expect(sent).toContain(
      'sentinel monitor mymaster redis-sentinel-master 6379 2'
    );
    expect(sent).toContain('sentinel auth-pass mymaster pw');
  });
});
