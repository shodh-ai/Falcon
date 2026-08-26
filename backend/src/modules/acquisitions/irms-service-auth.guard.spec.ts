/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Jest call inspection is intentionally dynamic */
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { ExecutionContext } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { IrmsServiceAuthGuard } from './irms-service-auth.guard';

describe('IrmsServiceAuthGuard', () => {
  const certificate = 'a'.repeat(64);
  const request = () => ({
    method: 'POST',
    headers: {
      authorization: 'Bearer signed-token',
      'x-client-cert-sha256': certificate,
      'x-request-nonce': 'nonce_1234567890123456',
      'x-request-timestamp': new Date().toISOString(),
    },
  });
  const context = (req: object) =>
    ({ switchToHttp: () => ({ getRequest: () => req }) }) as ExecutionContext;
  const configValues: Record<string, string> = {
    IRMS_TRUSTED_PROXY_MTLS: 'true',
    IRMS_OAUTH_PUBLIC_KEY: 'public-key',
    IRMS_OAUTH_ISSUER: 'https://irms.example/issuer',
    IRMS_OAUTH_AUDIENCE: 'falcon-acquisitions',
    IRMS_RATE_LIMIT_PER_MINUTE: '120',
  };
  const config = { get: jest.fn((key: string) => configValues[key]) };
  const jwt = {
    verifyAsync: jest.fn().mockResolvedValue({
      client_id: 'irms-client',
      tenant_id: 'a0000000-0000-4000-8000-000000000001',
      jti: 'token-jti',
      scope: 'acquisitions:create acquisitions:read-status',
      exp: 4_102_444_800,
      cnf: { 'x5t#S256': certificate },
    }),
  };
  const db = { query: jest.fn() };
  let guard: IrmsServiceAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    configValues.IRMS_TRUSTED_PROXY_MTLS = 'true';
    jwt.verifyAsync.mockResolvedValue({
      client_id: 'irms-client',
      tenant_id: 'a0000000-0000-4000-8000-000000000001',
      jti: 'token-jti',
      scope: 'acquisitions:create acquisitions:read-status',
      exp: 4_102_444_800,
      cnf: { 'x5t#S256': certificate },
    });
    guard = new IrmsServiceAuthGuard(
      config as unknown as ConfigService,
      jwt as unknown as JwtService,
      db as unknown as DataSource,
    );
  });

  it('fails closed unless the mTLS trust boundary is explicitly configured', async () => {
    configValues.IRMS_TRUSTED_PROXY_MTLS = 'false';
    await expect(guard.canActivate(context(request()))).rejects.toThrow(
      'mTLS trust boundary is not configured',
    );
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('accepts a bound short-lived token and stores only a hashed replay key', async () => {
    db.query
      .mockResolvedValueOnce([
        {
          integration_client_id: 'client-uuid',
          certificate_sha256: certificate,
          scopes: ['acquisitions:create', 'acquisitions:read-status'],
        },
      ])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([]);
    const req = request();
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(
      (req as typeof req & { integration: object }).integration,
    ).toMatchObject({
      integration_client_id: 'client-uuid',
      client_id: 'irms-client',
    });
    const replayParams = db.query.mock.calls[2][1];
    expect(replayParams[1]).toMatch(/^[a-f0-9]{64}$/);
    expect(replayParams[1]).not.toContain('token-jti');
  });

  it('rejects certificate-binding mismatch and insufficient scopes', async () => {
    jwt.verifyAsync.mockResolvedValueOnce({
      client_id: 'irms-client',
      tenant_id: 'tenant',
      jti: 'jti',
      scope: 'acquisitions:read-status',
      exp: 4_102_444_800,
      cnf: { 'x5t#S256': certificate },
    });
    db.query
      .mockResolvedValueOnce([
        {
          integration_client_id: 'id',
          certificate_sha256: certificate,
          scopes: ['acquisitions:create'],
        },
      ])
      .mockResolvedValueOnce([{ count: 0 }]);
    await expect(guard.canActivate(context(request()))).rejects.toThrow(
      'lacks acquisitions:create',
    );

    const badBinding = request();
    badBinding.headers['x-client-cert-sha256'] = 'b'.repeat(64);
    await expect(guard.canActivate(context(badBinding))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects excessive traffic and replayed nonces', async () => {
    db.query
      .mockResolvedValueOnce([
        {
          integration_client_id: 'id',
          certificate_sha256: certificate,
          scopes: ['acquisitions:create'],
        },
      ])
      .mockResolvedValueOnce([{ count: 120 }]);
    await expect(guard.canActivate(context(request()))).rejects.toThrow(
      'rate limit',
    );

    jest.clearAllMocks();
    db.query
      .mockResolvedValueOnce([
        {
          integration_client_id: 'id',
          certificate_sha256: certificate,
          scopes: ['acquisitions:create'],
        },
      ])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockRejectedValueOnce(new Error('duplicate nonce'));
    await expect(guard.canActivate(context(request()))).rejects.toThrow(
      'replay detected',
    );
  });
});
