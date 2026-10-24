import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { DataSource } from 'typeorm';
import type { FalconNotification } from '../../entities/falcon-notification.entity';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway tenant-bound authorization (offline)', () => {
  const userId = 'synthetic-user';
  const tenantId = 'synthetic-tenant';
  let jwt: { verify: jest.Mock };
  let db: { query: jest.Mock };
  let gateway: NotificationsGateway;
  let socket: ReturnType<typeof makeSocket>;
  let debug: jest.SpyInstance;
  let values: Record<string, unknown>;
  const expires = () => Math.floor(Date.now() / 1_000) + 3_600;

  function makeSocket() {
    return {
      handshake: {
        auth: { token: 'synthetic-signed-token' } as Record<string, unknown>,
        headers: {} as Record<string, unknown>,
        query: {} as Record<string, unknown>,
      },
      data: {} as Record<string, unknown>,
      connected: true,
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
  }

  const connect = () => gateway.handleConnection(socket as unknown as Socket);

  beforeEach(() => {
    jwt = {
      verify: jest
        .fn()
        .mockReturnValue({ sub: userId, tenantId, exp: expires() }),
    };
    values = {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://portal.example.test',
      SAAS_BASE_DOMAIN: 'example.test',
    };
    db = {
      query: jest
        .fn()
        .mockResolvedValue([{ subject_id: userId, tenant_id: tenantId }]),
    };
    gateway = new NotificationsGateway(
      jwt as unknown as JwtService,
      db as unknown as DataSource,
      new ConfigService(values),
    );
    socket = makeSocket();
    debug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    gateway.onModuleDestroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('joins only the verified active same-tenant user room', async () => {
    await connect();

    expect(jwt.verify).toHaveBeenCalledWith('synthetic-signed-token');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('u.user_id = $1 AND u.tenant_id = $2'),
      [userId, tenantId],
    );
    const [sql] = db.query.mock.calls[0] as [string];
    expect(sql).toContain('u.is_active = true AND u.deleted_at IS NULL');
    expect(sql).toContain('t.is_active = true');
    expect(socket.data).toEqual({ userId, tenantId, subjectType: 'user' });
    expect(socket.join).toHaveBeenCalledWith(
      `tenant:${tenantId}:user:${userId}`,
    );
    expect(socket.emit).toHaveBeenCalledWith('notifications:ready', {
      ok: true,
    });
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('preserves authorization-header support without a query-string token', async () => {
    socket.handshake.auth = {};
    socket.handshake.headers.authorization = 'Bearer synthetic-header-token';

    await connect();

    expect(jwt.verify).toHaveBeenCalledWith('synthetic-header-token');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('preserves the legacy signed user_id subject with an explicit tenant claim', async () => {
    jwt.verify.mockReturnValue({ user_id: userId, tenantId, exp: expires() });
    await connect();
    expect(socket.join).toHaveBeenCalledWith(
      `tenant:${tenantId}:user:${userId}`,
    );
  });

  it.each([
    {},
    { sub: userId },
    { sub: userId, tenantId: '' },
    { sub: userId, tenantId: ' tenant-a' },
    { sub: userId, tenantId: 123 },
    { tenantId },
    { sub: '', tenantId },
  ])(
    'rejects absent/malformed signed subject or tenant before database access (%#)',
    async (payload) => {
      jwt.verify.mockReturnValue(payload);
      await connect();
      expect(db.query).not.toHaveBeenCalled();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.emit).not.toHaveBeenCalled();
    },
  );

  it.each([
    'other tenant',
    'inactive user',
    'deleted user',
    'unknown user',
    'inactive tenant',
  ])(
    'rejects a %s when the scoped account lookup has no eligible result',
    async () => {
      db.query.mockResolvedValue([]);
      await connect();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.emit).not.toHaveBeenCalled();
    },
  );

  it.each([
    { rows: [{ subject_id: 'different-user', tenant_id: tenantId }] },
    { rows: [{ subject_id: userId, tenant_id: 'different-tenant' }] },
    {
      rows: [
        { subject_id: userId, tenant_id: tenantId },
        { subject_id: userId, tenant_id: tenantId },
      ],
    },
  ])(
    'fails closed on unexpected scoped lookup results (%#)',
    async ({ rows }) => {
      db.query.mockResolvedValue(rows);
      await connect();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid signatures without querying or exposing token/provider errors', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('private token/provider detail');
    });
    await connect();
    expect(db.query).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(debug).toHaveBeenCalledWith(
      'Notifications socket rejected (AUTHORIZATION_FAILED)',
    );
    expect(debug).not.toHaveBeenCalledWith(expect.stringContaining('private'));
  });

  it('rejects query-only tokens before signature verification', async () => {
    socket.handshake.auth = {};
    socket.handshake.query.token = 'synthetic-query-token';
    await connect();
    expect(jwt.verify).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('fails closed on account lookup failure with a sanitized rejection', async () => {
    db.query.mockRejectedValue(new Error('private database detail'));
    await connect();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(
      'Notifications socket rejected (AUTHORIZATION_FAILED)',
    );
  });

  describe('existing parent-link JWT issuer', () => {
    const linkId = 'synthetic-parent-link';
    const parentMobile = 'synthetic-registered-mobile';

    beforeEach(() => {
      jwt.verify.mockReturnValue({
        sub: linkId,
        tenantId,
        authType: 'parent',
        parentMobile,
        exp: expires(),
      });
      db.query.mockResolvedValue([{ subject_id: linkId, tenant_id: tenantId }]);
    });

    it('preserves a verified parent link in a separate tenant-bound parent room', async () => {
      await connect();
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM parent_student_links p'),
        [linkId, tenantId, parentMobile],
      );
      const [sql] = db.query.mock.calls[0] as [string];
      expect(sql).toContain('p.link_id = $1');
      expect(sql).toContain('p.tenant_id = $2');
      expect(sql).not.toContain('COALESCE');
      expect(sql).toContain('p.parent_mobile = $3');
      expect(sql).toContain('t.is_active = true');
      expect(sql).not.toContain('p.is_active');
      expect(socket.join).toHaveBeenCalledWith(
        `tenant:${tenantId}:parent:${linkId}`,
      );
      expect(socket.data.subjectType).toBe('parent');
      expect(socket.emit).toHaveBeenCalledWith('notifications:ready', {
        ok: true,
      });
    });

    it('does not default a parent link with missing stored tenant context', async () => {
      db.query.mockResolvedValue([{ subject_id: linkId, tenant_id: null }]);
      await connect();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it.each([
      'wrong tenant',
      'wrong mobile',
      'missing link',
      'inactive tenant',
    ])('rejects parent authorization with %s', async () => {
      db.query.mockResolvedValue([]);
      await connect();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it.each([
      { sub: linkId, tenantId, authType: 'parent' },
      { sub: linkId, authType: 'parent', parentMobile },
    ])(
      'rejects missing signed parent mobile/tenant context (%#)',
      async (payload) => {
        jwt.verify.mockReturnValue(payload);
        await connect();
        expect(db.query).not.toHaveBeenCalled();
        expect(socket.disconnect).toHaveBeenCalledWith(true);
      },
    );
  });

  describe('browser Origin policy', () => {
    beforeEach(() => {
      db.query.mockResolvedValue([
        {
          subject_id: userId,
          tenant_id: tenantId,
          custom_domain: 'university.example.test',
          subdomain: 'university',
        },
      ]);
    });

    it.each(['https://portal.example.test', 'https://university.example.test'])(
      'allows the exact shared frontend or signed tenant origin %s',
      async (origin) => {
        socket.handshake.headers.origin = origin;
        await connect();
        expect(socket.disconnect).not.toHaveBeenCalled();
        expect(socket.join).toHaveBeenCalledTimes(1);
      },
    );

    it('allows a separately configured custom domain for the signed tenant', async () => {
      socket.handshake.headers.origin = 'https://faculty.university.test';
      db.query.mockResolvedValue([
        {
          subject_id: userId,
          tenant_id: tenantId,
          custom_domain: 'faculty.university.test',
        },
      ]);
      await connect();
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it.each([
      'https://other-tenant.example.test',
      'https://university.example.test.evil.test',
      'https://evil.test',
      'https://portal.example.test/',
      'https://portal.example.test/path',
      'https://portal.example.test?private=ignored',
      'https://user@portal.example.test',
      'https://university.example.test:8443',
      'http://portal.example.test',
      'http://127.0.0.1:3001',
      'null',
      ['https://portal.example.test'],
    ])(
      'rejects an unauthorized or malformed Origin before room access (%#)',
      async (origin) => {
        socket.handshake.headers.origin = origin;
        await connect();
        expect(socket.disconnect).toHaveBeenCalledWith(true);
        expect(socket.join).not.toHaveBeenCalled();
        expect(socket.emit).not.toHaveBeenCalled();
      },
    );

    it.each([
      { custom_domain: 'https://evil.test', subdomain: 'other/path' },
      { custom_domain: '*.example.test', subdomain: '..' },
      { custom_domain: 'tenant.example.test:443', subdomain: 'bad tenant' },
    ])(
      'does not trust malformed tenant domain configuration (%#)',
      async (domains) => {
        socket.handshake.headers.origin = 'https://evil.test';
        db.query.mockResolvedValue([
          { subject_id: userId, tenant_id: tenantId, ...domains },
        ]);
        await connect();
        expect(socket.disconnect).toHaveBeenCalledWith(true);
        expect(socket.join).not.toHaveBeenCalled();
      },
    );

    it.each([
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'http://192.168.0.12:3001',
      'http://10.0.0.12:3001',
    ])(
      'preserves explicit development-only private Origin %s',
      async (origin) => {
        values.NODE_ENV = 'development';
        socket.handshake.headers.origin = origin;
        await connect();
        expect(socket.disconnect).not.toHaveBeenCalled();
      },
    );

    it.each(['test', undefined])(
      'never treats NODE_ENV=%s as explicit development',
      async (mode) => {
        values.NODE_ENV = mode;
        socket.handshake.headers.origin = 'http://127.0.0.1:3001';
        await connect();
        expect(socket.disconnect).toHaveBeenCalledWith(true);
      },
    );

    it('does not confuse a private hostname prefix with a private host', async () => {
      values.NODE_ENV = 'development';
      socket.handshake.headers.origin = 'http://localhost.evil.test';
      await connect();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('preserves the signed tenant localhost subdomain in explicit development', async () => {
      values.NODE_ENV = 'development';
      values.SAAS_BASE_DOMAIN = 'localhost';
      socket.handshake.headers.origin = 'http://university.localhost:3001';
      await connect();
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('rejects another tenant localhost subdomain even in explicit development', async () => {
      values.NODE_ENV = 'development';
      values.SAAS_BASE_DOMAIN = 'localhost';
      socket.handshake.headers.origin = 'http://other-tenant.localhost:3001';
      await connect();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('bounded socket authorization lifetime', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-15T14:00:00.000Z'));
      jwt.verify.mockReturnValue({ sub: userId, tenantId, exp: expires() });
    });

    it.each([
      undefined,
      null,
      'future',
      NaN,
      Infinity,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER,
    ])(
      'rejects missing or malformed expiry before any database access (%#)',
      async (exp) => {
        jwt.verify.mockReturnValue({ sub: userId, tenantId, exp });
        await connect();
        expect(db.query).not.toHaveBeenCalled();
        expect(socket.disconnect).toHaveBeenCalledWith(true);
        expect(jest.getTimerCount()).toBe(0);
      },
    );

    it('rejects an expired token even if an alternate verifier accidentally ignores expiry', async () => {
      jwt.verify.mockReturnValue({
        sub: userId,
        tenantId,
        exp: Date.now() / 1_000,
      });
      await connect();
      expect(db.query).not.toHaveBeenCalled();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects exactly at signed expiry and removes every lifecycle timer', async () => {
      jwt.verify.mockReturnValue({
        sub: userId,
        tenantId,
        exp: Date.now() / 1_000 + 1,
      });
      await connect();
      expect(jest.getTimerCount()).toBe(2);
      await jest.advanceTimersByTimeAsync(999);
      expect(socket.disconnect).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('chains long expiry waits within the Node timeout limit rather than disconnecting at 1ms', async () => {
      const timeout = jest.spyOn(global, 'setTimeout');
      const expiry = Date.now() + 31 * 24 * 60 * 60 * 1_000;
      jwt.verify.mockReturnValue({
        sub: userId,
        tenantId,
        exp: expiry / 1_000,
      });
      await connect();
      expect(timeout).toHaveBeenCalledWith(expect.any(Function), 2_147_483_647);
      const first = timeout.mock.calls[0][0];
      jest.setSystemTime(Date.now() + 2_147_483_647);
      first();
      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(timeout).toHaveBeenLastCalledWith(
        expect.any(Function),
        expiry - Date.now(),
      );
      const last = timeout.mock.calls.at(-1)![0];
      jest.setSystemTime(expiry);
      last();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it.each([
      'inactive account',
      'removed parent link',
      'inactive tenant',
      'tenant reassignment',
    ])(
      'disconnects after the bounded current-record recheck detects %s',
      async () => {
        await connect();
        db.query.mockResolvedValue([]);
        await jest.advanceTimersByTimeAsync(30_000);
        expect(db.query).toHaveBeenCalledTimes(2);
        expect(socket.disconnect).toHaveBeenCalledWith(true);
        expect(jest.getTimerCount()).toBe(0);
      },
    );

    it('uses the same signed parent-link eligibility on lifecycle revalidation', async () => {
      jwt.verify.mockReturnValue({
        sub: userId,
        tenantId,
        authType: 'parent',
        parentMobile: 'synthetic-mobile',
        exp: expires(),
      });
      await connect();
      await jest.advanceTimersByTimeAsync(30_000);
      expect(db.query).toHaveBeenLastCalledWith(
        expect.stringContaining('FROM parent_student_links p'),
        [userId, tenantId, 'synthetic-mobile'],
      );
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('does not overlap lifecycle database reads while a recheck is pending', async () => {
      await connect();
      let finish: (rows: never[]) => void = () => undefined;
      db.query.mockReturnValueOnce(
        new Promise<never[]>((resolve) => {
          finish = resolve;
        }),
      );
      await jest.advanceTimersByTimeAsync(90_000);
      expect(db.query).toHaveBeenCalledTimes(2);
      finish([]);
      await jest.advanceTimersByTimeAsync(0);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('fails closed on a lifecycle lookup error without logging provider details', async () => {
      await connect();
      db.query.mockRejectedValueOnce(
        new Error('private database provider detail'),
      );
      await jest.advanceTimersByTimeAsync(30_000);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(JSON.stringify(debug.mock.calls)).not.toContain(
        'private database',
      );
    });

    it('rechecks browser Origin against current tenant domain configuration', async () => {
      socket.handshake.headers.origin = 'https://tenant.example.test';
      db.query.mockResolvedValue([
        { subject_id: userId, tenant_id: tenantId, subdomain: 'tenant' },
      ]);
      await connect();
      db.query.mockResolvedValue([
        { subject_id: userId, tenant_id: tenantId, subdomain: 'replacement' },
      ]);
      await jest.advanceTimersByTimeAsync(30_000);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it.each(['disconnect', 'expiry', 'shutdown'])(
      'never joins when a delayed initial lookup returns after %s',
      async (reason) => {
        jwt.verify.mockReturnValue({
          sub: userId,
          tenantId,
          exp: Date.now() / 1_000 + 1,
        });
        let finish: (
          rows: { subject_id: string; tenant_id: string }[],
        ) => void = () => undefined;
        db.query.mockReturnValueOnce(
          new Promise<{ subject_id: string; tenant_id: string }[]>(
            (resolve) => {
              finish = resolve;
            },
          ),
        );
        const connecting = connect();
        if (reason === 'disconnect')
          gateway.handleDisconnect(socket as unknown as Socket);
        if (reason === 'expiry') await jest.advanceTimersByTimeAsync(1_000);
        if (reason === 'shutdown') gateway.onModuleDestroy();
        finish([{ subject_id: userId, tenant_id: tenantId }]);
        await connecting;
        expect(socket.join).not.toHaveBeenCalled();
        expect(socket.emit).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
      },
    );

    it('leaves a delayed room join if disconnect occurs while the adapter joins', async () => {
      let finish: () => void = () => undefined;
      socket.join.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
      const connecting = connect();
      await jest.advanceTimersByTimeAsync(0);
      expect(socket.join).toHaveBeenCalledTimes(1);
      gateway.handleDisconnect(socket as unknown as Socket);
      finish();
      await connecting;
      expect(socket.leave).toHaveBeenCalledWith(
        `tenant:${tenantId}:user:${userId}`,
      );
      expect(socket.emit).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('cleans all timers on disconnect and never rechecks afterward', async () => {
      await connect();
      gateway.handleDisconnect(socket as unknown as Socket);
      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('disconnects clients and blocks any new authorization when the module shuts down', async () => {
      await connect();
      gateway.onModuleDestroy();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(jest.getTimerCount()).toBe(0);
      const next = makeSocket();
      await gateway.handleConnection(next as unknown as Socket);
      expect(next.disconnect).toHaveBeenCalledWith(true);
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('tenant-bound notification fan-out', () => {
    let emit: jest.Mock;
    let to: jest.Mock;
    const notification = {
      notification_id: 'synthetic-notification',
      tenant_id: tenantId,
      user_id: userId,
      title: 'Synthetic notification',
      message: 'Synthetic message',
    } as FalconNotification;

    beforeEach(() => {
      emit = jest.fn();
      to = jest.fn().mockReturnValue({ emit });
      gateway.server = { to } as unknown as Server;
    });

    it('emits persisted user notifications only to the matching tenant/user room', () => {
      gateway.emitNotificationCreated(notification);
      expect(to).toHaveBeenCalledWith(`tenant:${tenantId}:user:${userId}`);
      expect(emit).toHaveBeenCalledWith(
        'notification:created',
        expect.objectContaining({ tenant_id: tenantId, user_id: userId }),
      );
      expect(to).not.toHaveBeenCalledWith(`user:${userId}`);
      expect(to).not.toHaveBeenCalledWith(
        `tenant:${tenantId}:parent:${userId}`,
      );
    });

    it.each([
      { ...notification, tenant_id: undefined },
      { ...notification, tenant_id: '' },
      { ...notification, user_id: undefined },
    ])('does not fan out without both scope IDs (%#)', (row) => {
      gateway.emitNotificationCreated(row as unknown as FalconNotification);
      expect(to).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });
  });
});
