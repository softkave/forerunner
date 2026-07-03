import {ConsoleForeLogger} from '../utils/foreLogger/ConsoleForeLogger.js';
import {IForeLogger} from '../utils/foreLogger/types.js';
import {getLocalIP} from '../utils/getLocalIP.js';
import {PostgresRunConfig, getAuthUserFromConfig} from './postgresRunConfig.js';

export interface BuildPostgresUriParams {
  postgresRunConfig: PostgresRunConfig;
  username?: string;
  password?: string;
  database?: string;
}

export function getPostgresConnectionHost(
  discoverability: PostgresRunConfig['discoverability']
): string {
  if (discoverability === 'local') {
    return '127.0.0.1';
  }

  const {ipv4, ipv6} = getLocalIP();
  if (ipv4.length > 0) {
    return ipv4[0]!;
  }

  if (ipv6.length > 0) {
    const address = ipv6[0]!;
    return address.includes(':') ? `[${address}]` : address;
  }

  throw new Error(
    'No non-loopback network address found; cannot build a global PostgreSQL URI'
  );
}

export function buildPostgresConnectionUri(
  params: BuildPostgresUriParams
): string {
  const {postgresRunConfig, username, password, database} = params;
  const host = getPostgresConnectionHost(postgresRunConfig.discoverability);
  const port = postgresRunConfig.port;
  const dbName = database ?? postgresRunConfig.dbs?.[0] ?? 'postgres';

  const queryParts: string[] = [];
  if (postgresRunConfig.ssl === 'enabled') {
    queryParts.push('sslmode=require', 'sslrejectunauthorized=false');
  }

  const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const base = `${host}:${port}/${encodeURIComponent(dbName)}${query}`;

  if (username) {
    const resolvedPassword =
      password ??
      postgresRunConfig.users?.find(user => user.username === username)
        ?.password ??
      '';
    const encodedUser = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(resolvedPassword);
    return `postgresql://${encodedUser}:${encodedPassword}@${base}`;
  }

  return `postgresql://${base}`;
}

export interface PrintPostgresUriOptions {
  postgresRunConfig: PostgresRunConfig;
  logger?: IForeLogger;
  username?: string;
  password?: string;
  database?: string;
}

export function printPostgresUriMain(options: PrintPostgresUriOptions): string {
  const {
    postgresRunConfig,
    logger = new ConsoleForeLogger({silent: false}),
    username,
    password,
    database,
  } = options;

  const uri = buildPostgresConnectionUri({
    postgresRunConfig,
    username,
    password,
    database,
  });

  logger.log('PostgreSQL URI:', uri);
  return uri;
}

export function getDefaultPostgresUriUser(
  postgresRunConfig: PostgresRunConfig
): {username: string; password?: string} | undefined {
  return getAuthUserFromConfig(postgresRunConfig);
}
