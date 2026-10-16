import { isIP } from 'node:net';
import type { RedisOptions } from 'ioredis';

type ReadRedisConfiguration = (key: string) => unknown;

const INVALID_CONFIGURATION = 'Redis connection configuration is invalid';
const absent = (value: unknown) =>
  value === undefined || value === null || value === '';

function hostname(value: string, allowUnderscore = false): boolean {
  if (value.length > 253) return false;
  const label = allowUnderscore
    ? /^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/i
    : /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  return value.split('.').every((part) => label.test(part));
}

/** Shared connection selection only: no clients, env loading or network access. */
export function redisConnectionOptions(
  read: ReadRedisConfiguration,
): RedisOptions {
  const host = read('REDIS_HOST') ?? '127.0.0.1';
  const rawPort = read('REDIS_PORT') ?? 6379;
  const rawPassword = read('REDIS_PASSWORD');
  const rawUsername = read('REDIS_USERNAME');
  const rawTls = read('REDIS_TLS');
  const rawServername = read('REDIS_TLS_SERVERNAME');
  const password = absent(rawPassword) ? undefined : rawPassword;
  const username = absent(rawUsername) ? undefined : rawUsername;
  const servername = absent(rawServername) ? undefined : rawServername;
  if (
    typeof host !== 'string' ||
    !(isIP(host) || hostname(host, true)) ||
    (typeof rawPort !== 'string' && typeof rawPort !== 'number') ||
    !/^[1-9]\d{0,4}$/.test(String(rawPort)) ||
    Number(rawPort) > 65_535 ||
    (password !== undefined && typeof password !== 'string') ||
    (username !== undefined &&
      (typeof username !== 'string' ||
        username.length > 256 ||
        username.trim() !== username ||
        [...username].some(
          (char) =>
            [0, 127].includes(char.charCodeAt(0)) || char.charCodeAt(0) < 32,
        ) ||
        password === undefined)) ||
    (!absent(rawTls) &&
      rawTls !== true &&
      rawTls !== false &&
      rawTls !== 'true' &&
      rawTls !== 'false')
  )
    throw new Error(INVALID_CONFIGURATION);
  const tls = rawTls === true || rawTls === 'true';
  if (
    (servername !== undefined &&
      (!tls ||
        typeof servername !== 'string' ||
        !hostname(servername) ||
        isIP(servername) !== 0)) ||
    (tls && !servername && !isIP(host) && !hostname(host))
  )
    throw new Error(INVALID_CONFIGURATION);

  return {
    host,
    port: Number(rawPort),
    password,
    ...(username ? { username } : {}),
    ...(tls
      ? {
          tls: {
            rejectUnauthorized: true,
            minVersion: 'TLSv1.2',
            ...(!isIP(host) || servername
              ? { servername: servername ?? host }
              : {}),
          },
        }
      : {}),
  };
}
