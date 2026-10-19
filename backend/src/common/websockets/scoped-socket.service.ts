import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { Socket } from 'socket.io';
import { DataSource } from 'typeorm';
import {
  expandCampusAdminRoles,
  rolesIntersect,
} from '../config/campus-admin.roles';

type Grant = {
  kind: 'leadership' | 'hostel' | 'fleet' | 'route';
  tenantId?: string;
  routeId?: string;
};
type Claims = {
  sub?: string;
  tenantId?: string;
  exp?: number;
  authType?: string;
  parentMobile?: string;
};
type Identity = {
  subject_id: string;
  tenant_id: string;
  roles: string[];
  custom_domain?: string;
  subdomain?: string;
  email?: string;
  parentMobile?: string;
};
type Session = {
  token: string;
  expiresAt: number;
  grants: Map<string, Grant>;
  refreshing: boolean;
  expiry?: ReturnType<typeof setTimeout>;
  recheck?: ReturnType<typeof setInterval>;
};
const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.trim() === value;
const fleetRoles = ['TransportOfficer', 'SuperAdmin', 'Registrar'];

/** Rooms are derived from a verified, current database identity, never a client
 * tenant claim. The same eligibility is rechecked throughout room membership. */
@Injectable()
export class ScopedSocketService implements OnModuleDestroy {
  private readonly sessions = new Map<Socket, Session>();
  private stopping = false;

  constructor(
    private readonly jwt: JwtService,
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  async join(client: Socket, grant: Grant): Promise<{ joined: boolean }> {
    try {
      if (!this.accepting(client)) throw new Error();
      const token = this.extractToken(client);
      if (!token) throw new Error();
      const existing = this.sessions.get(client);
      if (existing && existing.token !== token) throw new Error();
      const { identity, expiresAt } = await this.identity(client, token);
      const room = await this.authorize(identity, grant);
      // Another join may have established membership while these database
      // checks awaited. Re-read synchronously before creating any timers.
      if (!this.accepting(client)) throw new Error();
      let session = this.sessions.get(client);
      if (session && session.token !== token) throw new Error();
      if (!session) {
        session = { token, expiresAt, grants: new Map(), refreshing: false };
        this.sessions.set(client, session);
        this.scheduleExpiry(client, session);
        if (!this.current(client, session)) throw new Error();
        session.recheck = setInterval(() => {
          void this.revalidate(client, session!);
        }, 30_000);
        session.recheck.unref?.();
      }
      if (!this.current(client, session)) throw new Error();
      session.grants.set(room, grant);
      await client.join(room);
      if (!this.current(client, session)) {
        await client.leave(room);
        throw new Error();
      }
      return { joined: true };
    } catch {
      this.reject(client);
      return { joined: false };
    }
  }

  release(client: Socket): void {
    const session = this.sessions.get(client);
    if (session?.expiry) clearTimeout(session.expiry);
    if (session?.recheck) clearInterval(session.recheck);
    this.sessions.delete(client);
  }

  onModuleDestroy(): void {
    this.stopping = true;
    for (const client of this.sessions.keys()) this.reject(client);
  }

  private extractToken(client: Socket): string | null {
    // No query-string or ambient-cookie credentials: browser clients hand over
    // the same token used by their authenticated REST requests.
    const value: unknown =
      client.handshake.auth?.token ?? client.handshake.headers.authorization;
    return typeof value === 'string'
      ? value.replace(/^Bearer\s+/i, '').trim() || null
      : null;
  }

  private async identity(client: Socket, token: string) {
    const claims = this.jwt.verify<Claims>(token);
    if (
      !nonEmpty(claims.sub) ||
      !nonEmpty(claims.tenantId) ||
      !Number.isSafeInteger(claims.exp) ||
      !Number.isSafeInteger(claims.exp! * 1000) ||
      claims.exp! * 1000 <= Date.now()
    )
      throw new Error();
    const parent = claims.authType === 'parent';
    if (parent && !nonEmpty(claims.parentMobile)) throw new Error();
    const rows = await this.db.query<Identity[]>(
      parent
        ? `SELECT p.link_id AS subject_id, p.tenant_id, t.subdomain, t.custom_domain,
                p.parent_mobile AS "parentMobile", ARRAY['Parent']::text[] AS roles
         FROM parent_student_links p JOIN tenants t ON t.tenant_id=p.tenant_id AND t.is_active=true
         WHERE p.link_id=$1 AND p.tenant_id=$2 AND p.parent_mobile=$3 LIMIT 1`
        : `SELECT u.user_id AS subject_id, u.tenant_id, u.official_email AS email, t.subdomain, t.custom_domain,
           ARRAY(SELECT DISTINCT r.role_name FROM roles r
             WHERE r.deleted_at IS NULL AND (r.role_id=u.role_id OR EXISTS (
               SELECT 1 FROM user_roles ur WHERE ur.user_id=u.user_id AND ur.role_id=r.role_id AND ur.deleted_at IS NULL))) AS roles
         FROM users u JOIN tenants t ON t.tenant_id=u.tenant_id AND t.is_active=true
         WHERE u.user_id=$1 AND u.tenant_id=$2 AND u.is_active=true AND u.deleted_at IS NULL LIMIT 1`,
      parent
        ? [claims.sub, claims.tenantId, claims.parentMobile]
        : [claims.sub, claims.tenantId],
    );
    const identity = rows[0];
    if (
      rows.length !== 1 ||
      identity.subject_id !== claims.sub ||
      identity.tenant_id !== claims.tenantId ||
      !Array.isArray(identity.roles) ||
      !this.allowedOrigin(client.handshake.headers.origin, identity)
    )
      throw new Error();
    return { identity, expiresAt: claims.exp! * 1000 };
  }

  private async authorize(identity: Identity, grant: Grant): Promise<string> {
    const { tenant_id: tenantId, subject_id: userId, roles } = identity;
    if (grant.tenantId !== undefined && grant.tenantId !== tenantId)
      throw new Error();
    switch (grant.kind) {
      case 'leadership': {
        if (
          !rolesIntersect(roles, [
            'Chairman',
            'President',
            'Vice Chancellor',
            'SuperAdmin',
          ])
        )
          throw new Error();
        const bypass = expandCampusAdminRoles(roles).some((r) =>
          ['president', 'vice chancellor', 'superadmin'].includes(r),
        );
        if (!bypass) {
          const owners = await this.db.query(
            `SELECT 1 FROM owner_access_control WHERE tenant_id=$1 AND user_id=$2 AND is_active=true LIMIT 1`,
            [tenantId, userId],
          );
          if (!owners.length) throw new Error();
        }
        return `leadership_feed:${tenantId}`;
      }
      case 'hostel':
        if (!rolesIntersect(roles, ['Student', 'SuperAdmin', 'Warden']))
          throw new Error();
        return `tenant:${tenantId}`;
      case 'fleet':
        if (!rolesIntersect(roles, fleetRoles)) throw new Error();
        return `transport:${tenantId}:fleet`;
      case 'route': {
        if (!nonEmpty(grant.routeId)) throw new Error();
        const routes = await this.db.query(
          `SELECT route_id FROM transport_routes WHERE tenant_id=$1 AND route_id=$2 AND is_active=true`,
          [tenantId, grant.routeId],
        );
        if (!routes.length) throw new Error();
        if (!rolesIntersect(roles, fleetRoles)) {
          const student = rolesIntersect(roles, ['Student']);
          const parent = rolesIntersect(roles, ['Parent']);
          if (!student && !parent) throw new Error();
          const allocations = await this.db.query(
            `SELECT 1 FROM transport_allocations a
             JOIN users child ON child.user_id=a.student_user_id AND child.tenant_id=a.tenant_id
               AND child.is_active=true AND child.deleted_at IS NULL
             WHERE a.tenant_id=$1 AND a.route_id=$2 AND a.pass_status='ACTIVE' AND a.payment_status='PAID'
               AND (a.valid_until IS NULL OR a.valid_until >= CURRENT_DATE)
               AND (($3::boolean AND a.student_user_id=$4) OR ($5::boolean AND EXISTS (
                 SELECT 1 FROM parent_student_links p WHERE p.tenant_id=a.tenant_id AND p.student_user_id=a.student_user_id
                   AND (($6::text IS NOT NULL AND p.parent_mobile=$6)
                     OR ($6::text IS NULL AND lower(p.parent_email)=lower($7::text)))))) LIMIT 1`,
            [
              tenantId,
              grant.routeId,
              student,
              userId,
              parent,
              identity.parentMobile ?? null,
              identity.email ?? null,
            ],
          );
          if (!allocations.length) throw new Error();
        }
        return `transport:${tenantId}:route:${grant.routeId}`;
      }
    }
  }

  private accepting(client: Socket): boolean {
    return !this.stopping && client.connected !== false;
  }

  private current(client: Socket, session: Session): boolean {
    return (
      this.accepting(client) &&
      this.sessions.get(client) === session &&
      Date.now() < session.expiresAt
    );
  }

  private reject(client: Socket): void {
    this.release(client);
    // Reject this namespace without interrupting unrelated authenticated
    // notification sockets sharing the same Engine.IO connection.
    client.disconnect(false);
  }

  private scheduleExpiry(client: Socket, session: Session): void {
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      this.reject(client);
      return;
    }
    session.expiry = setTimeout(
      () => {
        if (this.sessions.get(client) === session)
          this.scheduleExpiry(client, session);
      },
      Math.min(remaining, 2_147_483_647),
    );
    session.expiry.unref?.();
  }

  private async revalidate(client: Socket, session: Session): Promise<void> {
    if (!this.current(client, session)) {
      this.reject(client);
      return;
    }
    if (session.refreshing) return;
    session.refreshing = true;
    try {
      const { identity } = await this.identity(client, session.token);
      for (const grant of session.grants.values())
        await this.authorize(identity, grant);
      if (!this.current(client, session)) this.reject(client);
    } catch {
      this.reject(client);
    } finally {
      session.refreshing = false;
    }
  }

  private allowedOrigin(origin: unknown, identity: Identity): boolean {
    if (origin === undefined) return true; // signed native clients
    if (typeof origin !== 'string') return false;
    try {
      const parsed = new URL(origin);
      if (origin !== parsed.origin) return false;
      const development = this.config.get('NODE_ENV') === 'development';
      const local =
        /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)$/.test(
          parsed.hostname,
        );
      if (
        parsed.protocol !== 'https:' &&
        !(development && local && parsed.protocol === 'http:')
      )
        return false;
      if (origin === this.config.get('FRONTEND_URL')) return true;
      if (development && local) return true;
      if (parsed.port) return false;
      const domain = this.config.get<string>('SAAS_BASE_DOMAIN');
      const dns = (v: unknown): v is string =>
        typeof v === 'string' &&
        v.length <= 253 &&
        v
          .split('.')
          .every((label) =>
            /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
          );
      if (
        dns(identity.custom_domain) &&
        parsed.hostname === identity.custom_domain
      )
        return true;
      return (
        dns(domain) &&
        dns(identity.subdomain) &&
        !identity.subdomain.includes('.') &&
        parsed.hostname === `${identity.subdomain}.${domain}`
      );
    } catch {
      return false;
    }
  }
}
