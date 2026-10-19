import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { Socket } from 'socket.io';
import { ScopedSocketService } from './scoped-socket.service';
import { TransportGateway } from '../../modules/transport/transport.gateway';
import { LeadershipGateway } from '../../modules/leadership/leadership.gateway';
import { HostelTatkalGateway } from '../../modules/hostel-tatkal/hostel-tatkal.gateway';

describe('Scoped socket membership', () => {
  const tenant = 'tenant-a';
  const user = 'user-a';
  const jwt = new JwtService({ secret: 'synthetic-socket-test-secret' });
  let service: ScopedSocketService;
  let query: jest.Mock;
  let roles: string[];
  let active: boolean;
  let allocation: boolean;
  let owner: boolean;

  function token(extra: Record<string, unknown> = {}) {
    return jwt.sign(
      { sub: user, tenantId: tenant, ...extra },
      { expiresIn: 120 },
    );
  }
  function socket(
    signedToken: string | undefined = token(),
    origin: string | undefined = 'https://falcon.example.test',
  ) {
    const client = {
      connected: true,
      handshake: {
        auth: signedToken ? { token: signedToken } : {},
        headers: { origin },
        query: {},
      },
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(function (this: { connected: boolean }) {
        this.connected = false;
      }),
    };
    return client as unknown as Socket & {
      join: jest.Mock;
      disconnect: jest.Mock;
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    roles = ['Student'];
    active = true;
    allocation = true;
    owner = false;
    query = jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('AS subject_id')) {
        if (!active || params[0] !== user || params[1] !== tenant) return [];
        return [
          {
            subject_id: user,
            tenant_id: tenant,
            roles,
            email: 'parent@example.test',
            parentMobile: params[2],
            subdomain: 'tenant-a',
          },
        ];
      }
      if (sql.includes('FROM owner_access_control')) return owner ? [{}] : [];
      if (sql.includes('FROM transport_routes'))
        return params[1] === 'route-a' ? [{ route_id: 'route-a' }] : [];
      if (sql.includes('FROM transport_allocations'))
        return allocation ? [{}] : [];
      throw new Error(`Unexpected synthetic query: ${sql}`);
    });
    service = new ScopedSocketService(
      jwt,
      { query } as unknown as DataSource,
      new ConfigService({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://falcon.example.test',
        SAAS_BASE_DOMAIN: 'example.test',
      }),
    );
  });
  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('allows a signed current student into only their own hostel room', async () => {
    const client = socket();
    await expect(
      service.join(client, { kind: 'hostel', tenantId: tenant }),
    ).resolves.toEqual({ joined: true });
    expect(client.join).toHaveBeenCalledWith('tenant:tenant-a');
    expect(query.mock.calls[0][1]).toEqual([user, tenant]);
  });

  it('rejects a spoofed tenant before joining any room', async () => {
    const client = socket();
    expect(
      await service.join(client, { kind: 'hostel', tenantId: 'tenant-b' }),
    ).toEqual({ joined: false });
    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(false);
  });

  it.each([
    'missing',
    'query',
    'bad-signature',
    'expired',
    'missing-exp',
    'missing-tenant',
  ])('rejects %s credentials', async (type) => {
    const client = socket();
    if (type === 'missing' || type === 'query') client.handshake.auth = {};
    if (type === 'query') client.handshake.query.token = token();
    if (type === 'bad-signature')
      client.handshake.auth.token = new JwtService({
        secret: 'other-secret',
      }).sign({ sub: user, tenantId: tenant }, { expiresIn: 120 });
    if (type === 'expired')
      client.handshake.auth.token = jwt.sign(
        { sub: user, tenantId: tenant },
        { expiresIn: -1 },
      );
    if (type === 'missing-exp')
      client.handshake.auth.token = jwt.sign({ sub: user, tenantId: tenant });
    if (type === 'missing-tenant')
      client.handshake.auth.token = jwt.sign({ sub: user }, { expiresIn: 120 });
    expect(await service.join(client, { kind: 'hostel' })).toEqual({
      joined: false,
    });
    expect(client.join).not.toHaveBeenCalled();
  });

  it.each([
    'https://evil.example',
    'http://falcon.example.test',
    'https://tenant-b.example.test',
    'https://falcon.example.test/path',
  ])('rejects browser origin %s', async (origin) => {
    const client = socket(token(), origin);
    expect(await service.join(client, { kind: 'hostel' })).toEqual({
      joined: false,
    });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('accepts a matching tenant subdomain and signed native client', async () => {
    expect(
      await service.join(socket(token(), 'https://tenant-a.example.test'), {
        kind: 'hostel',
      }),
    ).toEqual({ joined: true });
    const native = socket();
    delete native.handshake.headers.origin;
    expect(await service.join(native, { kind: 'hostel' })).toEqual({
      joined: true,
    });
  });

  it('ignores elevated roles in JWTs and denies student leadership/fleet access', async () => {
    for (const kind of ['leadership', 'fleet'] as const) {
      const client = socket(token({ roles: ['SuperAdmin'] }));
      expect(await service.join(client, { kind })).toEqual({ joined: false });
      expect(client.join).not.toHaveBeenCalled();
    }
  });

  it('requires the current chairman owner entitlement', async () => {
    roles = ['Chairman'];
    const denied = socket();
    expect(await service.join(denied, { kind: 'leadership' })).toEqual({
      joined: false,
    });
    owner = true;
    const allowed = socket();
    expect(
      await service.join(allowed, { kind: 'leadership', tenantId: tenant }),
    ).toEqual({ joined: true });
    expect(allowed.join).toHaveBeenCalledWith('leadership_feed:tenant-a');
  });

  it('preserves executive and legacy CampusAdmin access from database roles', async () => {
    roles = ['CampusAdmin'];
    const client = socket();
    expect(await service.join(client, { kind: 'leadership' })).toEqual({
      joined: true,
    });
    expect(await service.join(client, { kind: 'fleet' })).toEqual({
      joined: true,
    });
    expect(client.join).toHaveBeenCalledWith('transport:tenant-a:fleet');
  });

  it('requires the students paid active allocation on the requested same-tenant route', async () => {
    const client = socket();
    expect(
      await service.join(client, { kind: 'route', routeId: 'route-a' }),
    ).toEqual({ joined: true });
    expect(client.join).toHaveBeenCalledWith(
      'transport:tenant-a:route:route-a',
    );
    const sql = query.mock.calls.find(([s]) =>
      s.includes('FROM transport_allocations'),
    );
    expect(sql[0]).toContain(
      "a.pass_status='ACTIVE' AND a.payment_status='PAID'",
    );
    expect(sql[1]).toEqual([
      tenant,
      'route-a',
      true,
      user,
      false,
      null,
      'parent@example.test',
    ]);
    allocation = false;
    const stranger = socket();
    expect(
      await service.join(stranger, { kind: 'route', routeId: 'route-a' }),
    ).toEqual({ joined: false });
    expect(stranger.join).not.toHaveBeenCalled();
  });

  it('rejects a route outside the tenant before checking allocations', async () => {
    const client = socket();
    expect(
      await service.join(client, { kind: 'route', routeId: 'route-b' }),
    ).toEqual({ joined: false });
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('FROM transport_allocations'),
      ),
    ).toBe(false);
  });

  it('allows parent OTP credentials only for a currently linked childs allocation', async () => {
    roles = ['Parent'];
    const client = socket(
      token({ authType: 'parent', parentMobile: '9000000001' }),
    );
    expect(
      await service.join(client, { kind: 'route', routeId: 'route-a' }),
    ).toEqual({ joined: true });
    expect(query.mock.calls[0][1]).toEqual([user, tenant, '9000000001']);
    expect(
      query.mock.calls.find(([sql]) =>
        sql.includes('FROM transport_allocations'),
      )[1],
    ).toEqual([
      tenant,
      'route-a',
      false,
      user,
      true,
      '9000000001',
      'parent@example.test',
    ]);
    allocation = false;
    expect(
      await service.join(
        socket(token({ authType: 'parent', parentMobile: '9000000001' })),
        { kind: 'route', routeId: 'route-a' },
      ),
    ).toEqual({ joined: false });
  });

  it('disconnects a user disabled after joining and a revoked allocation', async () => {
    const student = socket();
    await service.join(student, { kind: 'hostel' });
    active = false;
    await jest.advanceTimersByTimeAsync(30_000);
    expect(student.disconnect).toHaveBeenCalled();
    active = true;
    const rider = socket();
    await service.join(rider, { kind: 'route', routeId: 'route-a' });
    allocation = false;
    await jest.advanceTimersByTimeAsync(30_000);
    expect(rider.disconnect).toHaveBeenCalled();
  });

  it('disconnects on exact token expiration and fails closed on recheck errors', async () => {
    const client = socket(
      jwt.sign({ sub: user, tenantId: tenant }, { expiresIn: 1 }),
    );
    await service.join(client, { kind: 'hostel' });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(client.disconnect).toHaveBeenCalled();
    const second = socket();
    await service.join(second, { kind: 'hostel' });
    query.mockRejectedValue(new Error('Database unavailable'));
    await jest.advanceTimersByTimeAsync(30_000);
    expect(second.disconnect).toHaveBeenCalled();
  });

  it('clears timers on disconnect/shutdown and never admits new shutdown members', async () => {
    const client = socket();
    await service.join(client, { kind: 'hostel' });
    service.release(client);
    expect(jest.getTimerCount()).toBe(0);
    service.onModuleDestroy();
    expect(await service.join(socket(), { kind: 'hostel' })).toEqual({
      joined: false,
    });
  });

  it('shares one tracked session across concurrent joins and clears every timer on disconnect', async () => {
    const client = socket();
    const results = await Promise.all([
      service.join(client, { kind: 'hostel' }),
      service.join(client, { kind: 'route', routeId: 'route-a' }),
    ]);
    expect(results).toEqual([{ joined: true }, { joined: true }]);
    expect((service as any).sessions.size).toBe(1);
    expect((service as any).sessions.get(client).grants.size).toBe(2);
    expect(jest.getTimerCount()).toBe(2);
    client.disconnect(false);
    service.release(client);
    expect((service as any).sessions.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not create a replacement session if disconnected while concurrent joins await authorization', async () => {
    const client = socket();
    const pending = [
      service.join(client, { kind: 'hostel' }),
      service.join(client, { kind: 'route', routeId: 'route-a' }),
    ];
    client.disconnect(false);
    service.release(client);
    expect(await Promise.all(pending)).toEqual([
      { joined: false }, { joined: false },
    ]);
    expect(client.join).not.toHaveBeenCalled();
    expect((service as any).sessions.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('uses scoped authorization for the actual gateway join handlers', async () => {
    const hostelClient = socket();
    expect(
      await new HostelTatkalGateway(service).handleJoin(
        { tenant_id: 'tenant-b' },
        hostelClient,
      ),
    ).toEqual({ joined: false });
    const leadershipClient = socket();
    expect(
      await new LeadershipGateway(service).handleJoin(
        { tenant_id: tenant },
        leadershipClient,
      ),
    ).toEqual({ joined: false });
    const routeClient = socket();
    expect(
      await new TransportGateway(service).handleJoinRoute(
        { route_id: 'route-a' },
        routeClient,
      ),
    ).toEqual({ joined: true, route_id: 'route-a' });
    expect(routeClient.join).toHaveBeenCalledWith(
      'transport:tenant-a:route:route-a',
    );
  });

  it('broadcasts fleet GPS only within the validated tenant room', () => {
    const gateway = new TransportGateway(service);
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as any;
    const payload = {
      route_id: 'route-a',
      lat: 1,
      lng: 2,
      timestamp: '2026-01-01T00:00:00Z',
    };
    gateway.broadcastGpsUpdate(tenant, 'route-a', payload);
    expect(to.mock.calls).toEqual([
      ['transport:tenant-a:route:route-a'],
      ['transport:tenant-a:fleet'],
    ]);
    expect(emit.mock.calls).toEqual([
      ['gps_update', payload],
      ['fleet_gps_update', payload],
    ]);
  });

  it('does not overflow Node timers for a signed session longer than 24.8 days', async () => {
    const client = socket(
      jwt.sign({ sub: user, tenantId: tenant }, { expiresIn: '30d' }),
    );
    await service.join(client, { kind: 'hostel' });
    await jest.advanceTimersByTimeAsync(2_000);
    expect(client.disconnect).not.toHaveBeenCalled();
  });
});
