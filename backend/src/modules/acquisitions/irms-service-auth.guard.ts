/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- JWT claims and TypeORM query() rows are untyped */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Request } from 'express';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';

export type IrmsIdentity = {
  integration_client_id: string;
  client_id: string;
  tenant_id: string;
  scopes: string[];
};

type IrmsRequest = Request & { integration?: IrmsIdentity };

@Injectable()
export class IrmsServiceAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<IrmsRequest>();
    if (this.config.get('IRMS_TRUSTED_PROXY_MTLS') !== 'true') {
      throw new UnauthorizedException(
        'IRMS mTLS trust boundary is not configured',
      );
    }
    const authorization = request.headers.authorization ?? '';
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';
    const certificate = String(
      request.headers['x-client-cert-sha256'] ?? '',
    ).toLowerCase();
    const nonce = String(request.headers['x-request-nonce'] ?? '');
    const timestamp = String(request.headers['x-request-timestamp'] ?? '');
    const requestTime = Date.parse(timestamp);
    if (
      !token ||
      !/^[a-f0-9]{64}$/.test(certificate) ||
      !/^[A-Za-z0-9_-]{16,180}$/.test(nonce) ||
      !Number.isFinite(requestTime) ||
      Math.abs(Date.now() - requestTime) > 5 * 60_000
    ) {
      throw new UnauthorizedException(
        'Client token and certificate binding are required',
      );
    }
    const publicKey = this.config.get<string>('IRMS_OAUTH_PUBLIC_KEY');
    const issuer = this.config.get<string>('IRMS_OAUTH_ISSUER');
    const audience = this.config.get<string>('IRMS_OAUTH_AUDIENCE');
    if (!publicKey || !issuer || !audience) {
      throw new UnauthorizedException(
        'IRMS OAuth validation is not configured',
      );
    }
    let claims: Record<string, any>;
    try {
      claims = await this.jwt.verifyAsync<Record<string, any>>(token, {
        publicKey: publicKey.replace(/\\n/g, '\n'),
        algorithms: ['RS256'],
        issuer,
        audience,
      });
    } catch {
      throw new UnauthorizedException('Invalid service token');
    }
    const clientId = String(claims.client_id ?? claims.sub ?? '');
    const tenantId = String(claims.tenant_id ?? '');
    const jti = String(claims.jti ?? '');
    const boundCert = String(claims.cnf?.['x5t#S256'] ?? '').toLowerCase();
    const tokenScopes = String(claims.scope ?? '')
      .split(/\s+/)
      .filter(Boolean);
    if (!clientId || !tenantId || !jti || boundCert !== certificate) {
      throw new UnauthorizedException('Service token binding is incomplete');
    }
    const clients = await this.db.query(
      `SELECT * FROM acq_integration_clients
       WHERE tenant_id=$1 AND client_id=$2 AND is_active=true`,
      [tenantId, clientId],
    );
    const client = clients[0];
    if (
      !client ||
      String(client.certificate_sha256).toLowerCase() !== certificate
    ) {
      throw new UnauthorizedException('Unknown integration client');
    }
    const recent = await this.db.query(
      `SELECT count(*)::int AS count FROM acq_integration_replay_nonces
       WHERE integration_client_id=$1 AND created_at>NOW()-INTERVAL '1 minute'`,
      [client.integration_client_id],
    );
    const limit = Number(this.config.get('IRMS_RATE_LIMIT_PER_MINUTE') ?? 120);
    if (Number(recent[0]?.count ?? 0) >= limit) {
      throw new UnauthorizedException('Integration rate limit exceeded');
    }
    const allowed = new Set(client.scopes as string[]);
    const requiredScope =
      request.method === 'GET'
        ? 'acquisitions:read-status'
        : 'acquisitions:create';
    if (!tokenScopes.includes(requiredScope) || !allowed.has(requiredScope)) {
      throw new UnauthorizedException(`Service token lacks ${requiredScope}`);
    }
    try {
      const replayKey = createHash('sha256')
        .update(`${jti}:${nonce}`)
        .digest('hex');
      await this.db.query(
        `INSERT INTO acq_integration_replay_nonces
           (integration_client_id,jti,expires_at)
         VALUES ($1,$2,to_timestamp($3))`,
        [client.integration_client_id, replayKey, Number(claims.exp)],
      );
    } catch {
      throw new UnauthorizedException('Service token replay detected');
    }
    request.integration = {
      integration_client_id: client.integration_client_id,
      client_id: clientId,
      tenant_id: tenantId,
      scopes: tokenScopes,
    };
    return true;
  }
}
