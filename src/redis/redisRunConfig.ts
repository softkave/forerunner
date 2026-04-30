import fs from 'fs';
import {ensureFile} from 'fs-extra';
import path from 'path';
import z from 'zod';
import {CAConfigSchema} from '../certs/types.js';
import {generateMongoPassword} from '../mongo/utils.js';

export const RedisDiscoverabilitySchema = z.enum(['local', 'global']);
export type RedisDiscoverability = z.infer<typeof RedisDiscoverabilitySchema>;

export const RedisAuthSchema = z.enum(['enabled', 'disabled']);
export type RedisAuth = z.infer<typeof RedisAuthSchema>;

export const RedisTLSSchema = z.enum(['enabled', 'disabled']);
export type RedisTLS = z.infer<typeof RedisTLSSchema>;

export const RedisPersistenceModeSchema = z.enum(['enabled', 'disabled']);
export type RedisPersistenceMode = z.infer<typeof RedisPersistenceModeSchema>;

export const RedisMaxmemoryPolicySchema = z.enum([
  'noeviction',
  'allkeys-lru',
  'allkeys-lfu',
  'allkeys-random',
  'volatile-lru',
  'volatile-lfu',
  'volatile-random',
  'volatile-ttl',
]);

/**
 * Redis eviction policy applied when `maxmemory` is reached.
 *
 * - **noeviction**: refuse writes that would exceed maxmemory (reads still work).
 * - **allkeys-lru**: evict least-recently-used keys across *all* keys.
 * - **allkeys-lfu**: evict least-frequently-used keys across *all* keys.
 * - **allkeys-random**: evict random keys across *all* keys.
 * - **volatile-lru**: evict LRU only among keys with an expiry (`EXPIRE`).
 * - **volatile-lfu**: evict LFU only among keys with an expiry.
 * - **volatile-random**: evict random keys only among keys with an expiry.
 * - **volatile-ttl**: evict keys with an expiry that are closest to expiring.
 *
 * Rule of thumb:
 * - Use `allkeys-lru` for cache-like workloads.
 * - Use `noeviction` when you prefer backpressure/errors over evicting data.
 */
export type RedisMaxmemoryPolicy = z.infer<typeof RedisMaxmemoryPolicySchema>;

export const RedisMemorySchema = z
  .object({
    /** Example: "512mb", "2gb". */
    maxmemory: z.string().min(1),
    /** Example: "allkeys-lru". */
    policy: RedisMaxmemoryPolicySchema.default('allkeys-lru'),
  })
  .optional();

export type RedisMemory = z.infer<typeof RedisMemorySchema>;

export const RedisPersistenceSchema = z
  .object({
    /**
     * AOF (Append Only File) persistence.
     *
     * When enabled, Redis logs write operations to an append-only log so it can
     * rebuild state after a restart. This typically gives better durability
     * (lower data loss) than RDB snapshots, at the cost of more write overhead.
     *
     * Contrast with `rdbSnapshots`: RDB saves point-in-time snapshots on a
     * schedule (e.g. every N seconds if there were N changes). AOF is a log of
     * writes.
     */
    aof: RedisPersistenceModeSchema.default('enabled'),
    /**
     * RDB snapshot persistence. When enabled and `save` is omitted, we use a
     * conservative default.
     *
     * RDB writes a compact snapshot file (`dump.rdb`) periodically. This can be
     * faster to load than replaying a long AOF, but may lose more recent writes
     * since it only captures state at snapshot times.
     */
    rdbSnapshots: RedisPersistenceModeSchema.default('enabled'),
    /**
     * One entry per `save <seconds> <changes>` line.
     *
     * Meaning: “after `<seconds>` seconds, if at least `<changes>` keys were
     * modified, create an RDB snapshot.”
     *
     * Example `["900 1", "300 10"]`:
     * - `save 900 1`: snapshot if *at least 1 write* happened within 15 minutes
     * - `save 300 10`: snapshot if *at least 10 writes* happened within 5 minutes
     *
     * Redis treats multiple `save` lines as OR conditions: if any rule matches,
     * a background save is triggered.
     * Only used when `rdbSnapshots=enabled`.
     */
    save: z.array(z.string().min(1)).optional(),
  })
  .default({aof: 'enabled', rdbSnapshots: 'enabled'});

export interface RedisPersistence {
  /** AOF persistence on/off. */
  aof: RedisPersistenceMode;
  /** RDB snapshot persistence on/off. */
  rdbSnapshots: RedisPersistenceMode;
  /** Optional `save` rules (see doc above). */
  save?: string[];
}

export const RedisTLSConfigSchema = z.object({
  tlsPort: z.number().int().positive().default(6380).optional(),
  /**
   * When TLS is enabled, we generate and mount certs using CA config.
   * This is the same shape as Postgres, but only the subset we need.
   */
  caConfig: CAConfigSchema.optional(),
});

export interface RedisTLSConfig {
  /**
   * TLS port for single-node mode. For multi-node topologies we use per-node
   * ports and do not rely on a shared TLS port.
   */
  tlsPort?: number;
  /** CA config used to generate the certs mounted into containers. */
  caConfig?: CAConfig;
}

export const RedisSingleSchema = z.object({
  mode: z.literal('single'),
  containerName: z
    .string()
    .min(1, 'containerName is required')
    .default('redis'),
  volumeName: z.string().min(1).optional(),
  port: z.number().int().positive().default(6379),
});

export const RedisClusterSchema = z
  .object({
    mode: z.literal('cluster'),
    containerNamePrefix: z
      .string()
      .min(1, 'containerNamePrefix is required')
      .default('redis-cluster'),
    /**
     * Total master nodes. Must be >= 3 for a production-like cluster.
     */
    masters: z.number().int().min(3).default(3),
    /**
     * Number of replicas per master (0..N). Default 1 for HA.
     */
    replicasPerMaster: z.number().int().min(0).default(1),
    /**
     * First TCP port used for the first node; subsequent nodes increment by 1.
     */
    basePort: z.number().int().positive().default(7000),
  })
  .strict();

export type RedisClusterMode = z.infer<typeof RedisClusterSchema>;

export const RedisSentinelSchema = z
  .object({
    mode: z.literal('sentinel'),
    /**
     * Base name used for master/replica containers (e.g. redis-sentinel-master).
     */
    containerNamePrefix: z.string().min(1).default('redis-sentinel'),
    masterPort: z.number().int().positive().default(6379),
    replicas: z.number().int().min(1).default(2),
    replicaBasePort: z.number().int().positive().default(6381),
    sentinels: z.number().int().min(1).default(3),
    sentinelBasePort: z.number().int().positive().default(26379),
    /** Sentinel quorum (must be <= sentinels). */
    quorum: z.number().int().min(1).default(2),
    /** Sentinel down-after-milliseconds */
    downAfterMs: z.number().int().positive().default(5000),
    /** Sentinel failover-timeout */
    failoverTimeoutMs: z.number().int().positive().default(60000),
  })
  .strict();

export type RedisSentinelMode = z.infer<typeof RedisSentinelSchema>;

const BaseRedisRunConfigSchema = z
  .object({
    workingDir: z.string().default(process.cwd()),
    redisVersion: z.string().default('8.0.3'),
    discoverability: RedisDiscoverabilitySchema.default('local'),
    auth: RedisAuthSchema.default('enabled'),
    /**
     * If auth is enabled and password is missing, we will generate a password
     * on `start` and cache it into the working dir so restarts reuse it.
     */
    password: z.string().optional(),
    tls: RedisTLSSchema.default('disabled'),
    tlsConfig: RedisTLSConfigSchema.optional(),
    keep: z.boolean().default(false),
    labels: z.record(z.string().min(1), z.string()).optional(),
    allowInsecureGlobal: z.boolean().default(false),
    persistence: RedisPersistenceSchema,
    memory: RedisMemorySchema,
  })
  .strict();

export const redisRunConfigSchema = z
  .discriminatedUnion('mode', [
    BaseRedisRunConfigSchema.merge(RedisSingleSchema),
    BaseRedisRunConfigSchema.merge(RedisClusterSchema),
    BaseRedisRunConfigSchema.merge(RedisSentinelSchema),
  ])
  .superRefine((data, ctx) => {
    // Safety: global exposure requires auth unless explicitly allowed.
    if (data.discoverability === 'global' && data.auth !== 'enabled') {
      if (!data.allowInsecureGlobal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'discoverability="global" requires auth="enabled" (or set allowInsecureGlobal=true)',
          path: ['discoverability'],
        });
      }
    }

    // TLS guardrails.
    if (data.tls === 'enabled') {
      const caConfig = data.tlsConfig?.caConfig;
      if (!caConfig) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'tlsConfig.caConfig is required when tls is enabled',
          path: ['tlsConfig', 'caConfig'],
        });
      }
    }

    // Sentinel constraints.
    if (data.mode === 'sentinel') {
      if (data.quorum > data.sentinels) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'quorum must be <= sentinels',
          path: ['quorum'],
        });
      }
    }
  });

export type RedisRunConfig = z.infer<typeof redisRunConfigSchema>;

/**
 * Explicit user-facing config types (mirrors `mongoRunConfig.ts` style).
 *
 * These types are meant for:
 * - authoring `redis-run-config.json` confidently
 * - understanding what each field means without reading implementation details
 */
export interface RedisRunConfigBase {
  /** Working directory where `redis-out/` (generated config/certs) is written. */
  workingDir: string;
  /** Docker image tag for `redis:<redisVersion>` (default is pinned). */
  redisVersion: string;
  /**
   * `local`: bind published ports to 127.0.0.1 only.
   * `global`: bind to all interfaces (use with care).
   */
  discoverability: RedisDiscoverability;
  /** Whether password authentication is enabled. */
  auth: RedisAuth;
  /**
   * Password used for `requirepass` (and `masterauth` for replicas).
   *
   * If omitted and `auth=enabled`, forerunner generates one and caches it.
   */
  password?: string;
  /** Whether TLS is enabled for redis-cli/redis-server connections. */
  tls: RedisTLS;
  /** TLS config (required when `tls=enabled`). */
  tlsConfig?: RedisTLSConfig;
  /** Keep docker volumes across restarts. */
  keep: boolean;
  /** Optional Docker labels applied to all containers. */
  labels?: Record<string, string>;
  /**
   * Safety override: allow `discoverability=global` with weak/insecure settings.
   * Default false.
   */
  allowInsecureGlobal: boolean;
  /** Persistence config: AOF and/or RDB snapshots. */
  persistence: RedisPersistence;
  /** Optional memory eviction configuration. */
  memory?: {maxmemory: string; policy: RedisMaxmemoryPolicy};
}

export interface RedisRunConfigSingle extends RedisRunConfigBase {
  mode: 'single';
  /** Docker container name for the single Redis instance. */
  containerName: string;
  /** Docker volume name for `/data` (defaults to `containerName`). */
  volumeName?: string;
  /** Redis port exposed by the container. */
  port: number;
}

export interface RedisRunConfigCluster extends RedisRunConfigBase {
  mode: 'cluster';
  /** Prefix used to name cluster node containers. */
  containerNamePrefix: string;
  /** Number of master nodes (minimum 3). */
  masters: number;
  /** Replicas per master (0..N). */
  replicasPerMaster: number;
  /** Port for first node; subsequent nodes increment by 1. */
  basePort: number;
}

export interface RedisRunConfigSentinel extends RedisRunConfigBase {
  mode: 'sentinel';
  /** Prefix used for master/replica/sentinel container names. */
  containerNamePrefix: string;
  /** Port for master redis-server. */
  masterPort: number;
  /** Number of replica redis-server nodes. */
  replicas: number;
  /** Base port for replicas; replicas increment from this value. */
  replicaBasePort: number;
  /** Number of sentinel processes. */
  sentinels: number;
  /** Base port for sentinels; sentinels increment from this value. */
  sentinelBasePort: number;
  /** Sentinel quorum (must be <= sentinels). */
  quorum: number;
  /** Sentinel down-after-milliseconds. */
  downAfterMs: number;
  /** Sentinel failover-timeout. */
  failoverTimeoutMs: number;
}

export type RedisRunConfigExplicit =
  | RedisRunConfigSingle
  | RedisRunConfigCluster
  | RedisRunConfigSentinel;

export function getCachedRedisRunConfigFilepath(params: {
  redisRunConfig: RedisRunConfig;
}) {
  const {redisRunConfig} = params;
  return path.join(redisRunConfig.workingDir, 'redis-run-config.json');
}

export async function cacheRedisRunConfig(params: {
  redisRunConfig: RedisRunConfig;
}) {
  const {redisRunConfig} = params;
  const cachedFilepath = getCachedRedisRunConfigFilepath({redisRunConfig});
  await ensureFile(cachedFilepath);
  await fs.promises.writeFile(
    cachedFilepath,
    JSON.stringify(redisRunConfig, null, 2)
  );
}

export async function getRedisRunConfig(params: {
  redisRunConfigFilepath: string;
  cacheConfig?: boolean;
}) {
  const {redisRunConfigFilepath, cacheConfig = false} = params;
  const redisRunConfig = redisRunConfigSchema.parse(
    JSON.parse(await fs.promises.readFile(redisRunConfigFilepath, 'utf8'))
  );
  if (cacheConfig) {
    await cacheRedisRunConfig({redisRunConfig});
  }
  return redisRunConfig;
}

/**
 * Resolve (and if necessary generate) the auth password used by Redis.
 * We keep it stable by caching it into the run config file in workingDir.
 */
export async function ensureRedisPassword(params: {
  redisRunConfig: RedisRunConfig;
}): Promise<{redisRunConfig: RedisRunConfig; password?: string}> {
  const {redisRunConfig} = params;
  if (redisRunConfig.auth !== 'enabled') {
    return {redisRunConfig, password: undefined};
  }
  if (redisRunConfig.password && redisRunConfig.password.trim().length > 0) {
    return {redisRunConfig, password: redisRunConfig.password};
  }

  const generated = generateMongoPassword();
  const updated = {...redisRunConfig, password: generated} as RedisRunConfig;
  await cacheRedisRunConfig({redisRunConfig: updated});
  return {redisRunConfig: updated, password: generated};
}
