import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { redisConnectionOptions } from './redis-connection.config';

describe('shared Redis connection selection (offline)', () => {
  const options = (values: Record<string, unknown> = {}) =>
    redisConnectionOptions((key) => values[key]);

  it('preserves plaintext local defaults and leaves Bull retry/namespace behavior untouched', () => {
    expect(options()).toEqual({
      host: '127.0.0.1',
      port: 6379,
      password: undefined,
    });
    expect(options()).not.toHaveProperty('tls');
    expect(options()).not.toHaveProperty('maxRetriesPerRequest');
    expect(options()).not.toHaveProperty('keyPrefix');
    expect(options()).not.toHaveProperty('prefix');
    expect(options()).not.toHaveProperty('db');
  });

  it.each([undefined, null, ''])(
    'preserves optional empty legacy credentials (%#)',
    (value) => {
      expect(
        options({
          REDIS_PASSWORD: value,
          REDIS_USERNAME: value,
          REDIS_TLS: value,
          REDIS_TLS_SERVERNAME: value,
        }),
      ).toEqual(options());
    },
  );

  it('preserves a password-only existing target without rewriting the credential', () => {
    expect(
      options({
        REDIS_HOST: 'falcon-local-redis',
        REDIS_PORT: '6380',
        REDIS_PASSWORD: ' synthetic opaque password ',
      }),
    ).toEqual({
      host: 'falcon-local-redis',
      port: 6380,
      password: ' synthetic opaque password ',
    });
  });

  it('uses the approved ACL principal with mandatory certificate verification and TLS1.2 minimum', () => {
    expect(
      options({
        REDIS_HOST: 'redis.staging.example.invalid',
        REDIS_PORT: '6380',
        REDIS_USERNAME: 'notification-worker',
        REDIS_PASSWORD: 'synthetic-only-not-used',
        REDIS_TLS: 'true',
      }),
    ).toEqual({
      host: 'redis.staging.example.invalid',
      port: 6380,
      username: 'notification-worker',
      password: 'synthetic-only-not-used',
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        servername: 'redis.staging.example.invalid',
      },
    });
  });

  it('supports an explicitly approved SNI hostname for an IP endpoint', () => {
    expect(
      options({
        REDIS_HOST: '192.0.2.4',
        REDIS_TLS: true,
        REDIS_TLS_SERVERNAME: 'redis.staging.example.invalid',
      }).tls,
    ).toEqual({
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      servername: 'redis.staging.example.invalid',
    });
  });

  it('retains certificate verification against an IP endpoint without inventing SNI', () => {
    expect(options({ REDIS_HOST: '2001:db8::4', REDIS_TLS: true }).tls).toEqual(
      { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    );
  });

  it.each([false, 'false'])(
    'does not enable TLS for explicit false (%#)',
    (value) => {
      expect(options({ REDIS_TLS: value })).not.toHaveProperty('tls');
    },
  );

  it.each([
    ['REDIS_HOST', 'redis://private-user:private-password@redis.invalid'],
    ['REDIS_HOST', 'redis.invalid/path'],
    ['REDIS_HOST', ' redis.invalid'],
    ['REDIS_HOST', 'redis.invalid\r\nprivate'],
    ['REDIS_HOST', ''],
    ['REDIS_HOST', 123],
    ['REDIS_PORT', '6379unexpected'],
    ['REDIS_PORT', '06379'],
    ['REDIS_PORT', 0],
    ['REDIS_PORT', 65_536],
    ['REDIS_PORT', 6379.5],
    ['REDIS_PORT', NaN],
    ['REDIS_PORT', true],
    ['REDIS_PASSWORD', { private: 'not-a-string' }],
    ['REDIS_USERNAME', 'worker'],
    ['REDIS_USERNAME', false],
    ['REDIS_TLS', 'TRUE'],
    ['REDIS_TLS', 'yes'],
    ['REDIS_TLS', 1],
    ['REDIS_TLS_SERVERNAME', 'redis.invalid'],
  ])(
    'rejects malformed setting %s without returning secret input (%#)',
    (key, value) => {
      expect(() => options({ [key]: value })).toThrow(
        'Redis connection configuration is invalid',
      );
    },
  );

  it.each([
    ' worker',
    'worker\nprivate',
    'worker\0private',
    'x'.repeat(257),
    { private: 'detail' },
  ])(
    'rejects malformed ACL usernames even with a credential (%#)',
    (username) => {
      expect(() =>
        options({
          REDIS_USERNAME: username,
          REDIS_PASSWORD: 'synthetic-only-not-used',
        }),
      ).toThrow('Redis connection configuration is invalid');
    },
  );

  it.each([
    'https://redis.invalid',
    'redis.invalid/path',
    '*.redis.invalid',
    ' redis.invalid',
    '127.0.0.1',
    '2001:db8::4',
    123,
  ])('rejects malformed TLS servernames (%#)', (servername) => {
    expect(() =>
      options({ REDIS_TLS: true, REDIS_TLS_SERVERNAME: servername }),
    ).toThrow('Redis connection configuration is invalid');
  });

  it('keeps certificate verification enabled despite an unrecognized insecure override', () => {
    const config = options({
      REDIS_TLS: 'true',
      REDIS_TLS_REJECT_UNAUTHORIZED: 'false',
    });
    expect(config.tls?.rejectUnauthorized).toBe(true);
  });

  it('binds the actual Bull root factory to the same validated helper without importing AppModule', () => {
    const file = ts.createSourceFile(
      'app.module.ts',
      readFileSync(resolve(__dirname, '../../app.module.ts'), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    let bullFactory: ts.ObjectLiteralExpression | undefined;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(file) === 'BullModule' &&
        node.expression.name.text === 'forRootAsync'
      ) {
        const argument = node.arguments[0];
        if (ts.isObjectLiteralExpression(argument)) bullFactory = argument;
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(bullFactory).toBeDefined();
    const factory = bullFactory!.properties.find(
      (property) =>
        ts.isPropertyAssignment(property) &&
        property.name.getText(file) === 'useFactory',
    );
    expect(factory?.getText(file)).toContain(
      'connection: redisConnectionOptions(',
    );
    expect(factory?.getText(file)).toContain('configService.get<unknown>(key)');
    expect(factory?.getText(file)).not.toContain('maxRetriesPerRequest');
    expect(factory?.getText(file)).not.toContain('PORTAL_NOTIFICATION');
  });
});
