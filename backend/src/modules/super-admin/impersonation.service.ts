import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../core/audit/audit.service';
import { AuthService } from '../../auth/auth.service';

@Injectable()
export class ImpersonationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
  ) {}

  async startImpersonation(
    impersonatorUserId: string,
    tenantId: string,
    tenantSchema: string,
    targetUserId: string,
    reason?: string,
  ) {
    const targets = await this.dataSource.query(
      `SELECT user_id, name, official_email, tenant_id FROM users WHERE user_id = $1 AND tenant_id = $2`,
      [targetUserId, tenantId],
    );
    if (!targets[0]) throw new NotFoundException('Target user not found');

    const sessionRows = await this.dataSource.query(
      `INSERT INTO impersonation_sessions (tenant_id, impersonator_user_id, target_user_id, reason)
       VALUES ($1, $2, $3, $4) RETURNING session_id`,
      [tenantId, impersonatorUserId, targetUserId, reason ?? null],
    );

    await this.audit.log({
      userId: impersonatorUserId,
      action: 'IMPERSONATION_START',
      entityType: 'USER',
      entityId: targetUserId,
      details: { session_id: sessionRows[0].session_id, reason },
    });

    const target = await this.authService.findById(targetUserId, tenantId);
    if (!target) throw new NotFoundException('Target user not found');

    await this.authService.ensurePrimaryRoleMapping(target);
    const refreshed = await this.authService.findById(targetUserId, tenantId);
    const tokenUser = refreshed ?? target;
    const roleClaims = this.authService.getRoleClaims(tokenUser);
    if (!roleClaims.primaryRole) {
      throw new ForbiddenException(
        'Target user has no assignable role for impersonation',
      );
    }

    const baseToken = this.authService.signToken(
      tokenUser,
      tenantId,
      tenantSchema,
    );
    const decoded = this.jwt.decode(baseToken);
    const token = this.jwt.sign(
      {
        ...decoded,
        impersonator: impersonatorUserId,
        impersonator_user_id: impersonatorUserId,
        read_only_impersonation: true,
        impersonation_session_id: sessionRows[0].session_id,
      },
      { secret: this.config.get('JWT_SECRET'), expiresIn: '2h' },
    );

    return {
      token,
      session_id: sessionRows[0].session_id,
      target: {
        user_id: targetUserId,
        name: tokenUser.name,
        email: tokenUser.email,
        role: roleClaims.primaryRole,
      },
      read_only: true,
    };
  }

  async endImpersonation(impersonatorUserId: string, sessionId: string) {
    await this.dataSource.query(
      `UPDATE impersonation_sessions SET ended_at = NOW()
       WHERE session_id = $1 AND impersonator_user_id = $2 AND ended_at IS NULL`,
      [sessionId, impersonatorUserId],
    );
    await this.audit.log({
      userId: impersonatorUserId,
      action: 'IMPERSONATION_END',
      entityType: 'SESSION',
      entityId: sessionId,
    });
    return { ended: true };
  }
}
