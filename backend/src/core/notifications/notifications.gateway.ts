import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DataSource } from 'typeorm';
import type { FalconNotification } from '../../entities/falcon-notification.entity';

type JwtHandshakePayload = {
  sub?: string;
  user_id?: string;
  tenantId?: string;
  authType?: string;
  parentMobile?: string;
  exp?: number;
};

type NotificationSocketData = {
  userId?: string;
  tenantId?: string;
  subjectType?: 'user' | 'parent';
};

const nonEmptyClaim = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.trim() === value;

type Subject = {
  subject_id: string;
  tenant_id: string;
  custom_domain?: string | null;
  subdomain?: string;
};

type SocketAuthorization = {
  payload: JwtHandshakePayload;
  expiresAt: number;
  refreshing: boolean;
  expiry?: ReturnType<typeof setTimeout>;
  recheck?: ReturnType<typeof setInterval>;
};

const dnsName = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 253 &&
  value
    .split('.')
    .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));

@WebSocketGateway({
  namespace: '/notifications',
  // Polling CORS is not the WebSocket security boundary. Authorize the actual
  // browser Origin against the signed tenant before joining any room below.
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly authorizations = new Map<Socket, SocketAuthorization>();
  private stopping = false;

  constructor(
    private readonly jwtService: JwtService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    const token = this.extractToken(client);
    if (!token || this.stopping || this.authorizations.has(client)) {
      this.reject(client);
      return;
    }
    try {
      const payload = this.jwtService.verify<JwtHandshakePayload>(token);
      const userId = payload.sub ?? payload.user_id;
      const tenantId = payload.tenantId;
      if (
        !nonEmptyClaim(userId) ||
        !nonEmptyClaim(tenantId) ||
        typeof payload.exp !== 'number' ||
        !Number.isSafeInteger(payload.exp) ||
        !Number.isSafeInteger(payload.exp * 1_000) ||
        payload.exp * 1_000 <= Date.now()
      ) {
        throw new Error();
      }
      const parent = payload.authType === 'parent';
      if (parent && !nonEmptyClaim(payload.parentMobile)) throw new Error();
      const authorization: SocketAuthorization = {
        payload,
        expiresAt: payload.exp * 1_000,
        refreshing: false,
      };
      this.authorizations.set(client, authorization);
      this.scheduleExpiry(client, authorization);
      await this.authorizeSubject(client, authorization);
      if (!this.current(client, authorization)) return;
      const subjectType = parent ? 'parent' : 'user';
      const data = client.data as NotificationSocketData;
      data.userId = userId;
      data.tenantId = tenantId;
      data.subjectType = subjectType;
      const room = this.subjectRoom(tenantId, userId, subjectType);
      await client.join(room);
      if (!this.current(client, authorization)) {
        await client.leave(room);
        return;
      }
      authorization.recheck = setInterval(() => {
        void this.revalidate(client, authorization);
      }, 30_000);
      authorization.recheck.unref?.();
      client.emit('notifications:ready', { ok: true });
    } catch {
      this.reject(client);
    }
  }

  private async authorizeSubject(
    client: Socket,
    authorization: SocketAuthorization,
  ): Promise<void> {
    const { payload } = authorization;
    const userId = payload.sub ?? payload.user_id;
    const tenantId = payload.tenantId;
    const parent = payload.authType === 'parent';
    const subjects = await this.dataSource.query<Subject[]>(
      parent
        ? `SELECT p.link_id AS subject_id, p.tenant_id, t.custom_domain, t.subdomain
             FROM parent_student_links p
             INNER JOIN tenants t
               ON t.tenant_id = p.tenant_id
               AND t.is_active = true
             WHERE p.link_id = $1
               AND p.tenant_id = $2
               AND p.parent_mobile = $3
             LIMIT 1`
        : `SELECT u.user_id AS subject_id, u.tenant_id, t.custom_domain, t.subdomain
             FROM users u
             INNER JOIN tenants t ON t.tenant_id = u.tenant_id
               AND t.is_active = true
             WHERE u.user_id = $1 AND u.tenant_id = $2
               AND u.is_active = true AND u.deleted_at IS NULL
             LIMIT 1`,
      parent ? [userId, tenantId, payload.parentMobile] : [userId, tenantId],
    );
    if (
      !this.current(client, authorization) ||
      subjects.length !== 1 ||
      subjects[0].subject_id !== userId ||
      subjects[0].tenant_id !== tenantId ||
      !this.allowedOrigin(client.handshake.headers.origin, subjects[0])
    ) {
      throw new Error();
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.clearAuthorization(client);
    const data = client.data as NotificationSocketData;
    if (data?.userId) {
      this.logger.debug('Notifications socket disconnected');
    }
  }

  onModuleDestroy(): void {
    this.stopping = true;
    for (const client of this.authorizations.keys()) this.reject(client);
  }

  private current(client: Socket, authorization: SocketAuthorization): boolean {
    return (
      !this.stopping &&
      client.connected !== false &&
      this.authorizations.get(client) === authorization &&
      Date.now() < authorization.expiresAt
    );
  }

  private clearAuthorization(client: Socket): void {
    const authorization = this.authorizations.get(client);
    if (!authorization) return;
    if (authorization.expiry) clearTimeout(authorization.expiry);
    if (authorization.recheck) clearInterval(authorization.recheck);
    this.authorizations.delete(client);
  }

  private reject(client: Socket): void {
    this.clearAuthorization(client);
    this.logger.debug('Notifications socket rejected (AUTHORIZATION_FAILED)');
    client.disconnect(true);
  }

  private scheduleExpiry(
    client: Socket,
    authorization: SocketAuthorization,
  ): void {
    const remaining = authorization.expiresAt - Date.now();
    if (remaining <= 0) {
      this.reject(client);
      return;
    }
    // Node clamps delays above 2^31-1 to 1ms; chain long-lived signed sessions.
    authorization.expiry = setTimeout(
      () => {
        if (this.authorizations.get(client) === authorization)
          this.scheduleExpiry(client, authorization);
      },
      Math.min(remaining, 2_147_483_647),
    );
    authorization.expiry.unref?.();
  }

  private async revalidate(
    client: Socket,
    authorization: SocketAuthorization,
  ): Promise<void> {
    if (!this.current(client, authorization)) {
      this.reject(client);
      return;
    }
    if (authorization.refreshing) return;
    authorization.refreshing = true;
    try {
      await this.authorizeSubject(client, authorization);
    } catch {
      this.reject(client);
    } finally {
      authorization.refreshing = false;
    }
  }

  private allowedOrigin(origin: unknown, subject: Subject): boolean {
    // Signed native/service clients need no browser Origin; credentials still
    // require signature, expiry and current same-tenant eligibility checks.
    if (origin === undefined) return true;
    if (typeof origin !== 'string') return false;
    try {
      const parsed = new URL(origin);
      if (origin !== parsed.origin) return false;
      const development =
        this.config.get<unknown>('NODE_ENV') === 'development';
      const base = this.config.get<unknown>('SAAS_BASE_DOMAIN');
      const tenantSubdomainHost =
        dnsName(base) &&
        typeof subject.subdomain === 'string' &&
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subject.subdomain)
          ? `${subject.subdomain}.${base}`
          : undefined;
      const privateDevelopmentHost =
        /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)$/.test(
          parsed.hostname,
        ) ||
        (base === 'localhost' && parsed.hostname === tenantSubdomainHost);
      if (
        parsed.protocol !== 'https:' &&
        !(development && parsed.protocol === 'http:' && privateDevelopmentHost)
      )
        return false;
      if (origin === this.config.get<unknown>('FRONTEND_URL')) return true;
      if (development && privateDevelopmentHost) return true;
      if (parsed.port) return false;
      if (
        dnsName(subject.custom_domain) &&
        parsed.hostname === subject.custom_domain
      )
        return true;
      return parsed.hostname === tenantSubdomainHost;
    } catch {
      return false;
    }
  }

  emitNotificationCreated(notification: FalconNotification) {
    if (
      !this.server ||
      !nonEmptyClaim(notification?.user_id) ||
      !nonEmptyClaim(notification?.tenant_id)
    )
      return;
    this.server
      .to(
        this.subjectRoom(notification.tenant_id, notification.user_id, 'user'),
      )
      .emit('notification:created', {
        notification_id: notification.notification_id,
        user_id: notification.user_id,
        tenant_id: notification.tenant_id,
        category: notification.category,
        title: notification.title,
        message: notification.message,
        action_link: notification.action_link,
        severity: notification.severity,
        intent: notification.intent,
        is_read: notification.is_read,
        created_at: notification.created_at,
        metadata: notification.metadata,
      });
  }

  private subjectRoom(
    tenantId: string,
    subjectId: string,
    type: 'user' | 'parent',
  ) {
    return `tenant:${tenantId}:${type}:${subjectId}`;
  }

  private extractToken(client: Socket): string | null {
    const authToken: unknown = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.replace(/^Bearer\s+/i, '').trim();
    }
    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.trim()) {
      return header.replace(/^Bearer\s+/i, '').trim();
    }
    return null;
  }
}
