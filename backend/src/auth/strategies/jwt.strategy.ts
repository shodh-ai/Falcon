import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { resolveJwtSecret } from '../../common/config/jwt-secret';
import { normalizeOnboardingStatusForWizard } from '../../modules/student-onboarding/onboarding-portal.util';
import type { AuthTokenPayload } from '../interfaces/auth-provider.interface';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
    @InjectDataSource() private readonly db: DataSource,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // Intentionally no query-string token — leaks via logs/Referer.
        (req: { cookies?: { falcon_auth_token?: string } }) =>
          req?.cookies?.falcon_auth_token ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(configService),
    });
  }

  async validate(
    payload: AuthTokenPayload & { authType?: string; parentMobile?: string },
  ) {
    if (!payload.tenantId) {
      throw new UnauthorizedException('Token missing tenant context');
    }

    if (payload.authType === 'parent') {
      return {
        user_id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: 'Parent',
        roles: ['Parent'],
        primaryRole: 'Parent',
        tenant_id: payload.tenantId,
        tenant_schema: payload.tenantSchema ?? 'public',
        auth_type: 'parent',
        parent_mobile: payload.parentMobile,
      };
    }

    const user = await this.authService.findById(payload.sub, payload.tenantId);

    if (!user) {
      throw new UnauthorizedException();
    }

    if (!user.is_active) {
      throw new UnauthorizedException('User account is inactive');
    }
    if((payload.leadership_auth_revision ?? 0)!==(user.leadership_auth_revision ?? 0)){
      throw new UnauthorizedException('Office assignment changed; sign in again');
    }

    if (user.role?.role_name === 'FacultyReadOnly') {
      // Read the binding on every authenticated request: disabling it takes
      // effect immediately, and client-supplied claims cannot select a source.
      const rows = await this.db.query(
        `SELECT b.source_user_id FROM faculty_read_only_viewers b
         JOIN users source ON source.user_id=b.source_user_id
           AND source.tenant_id=b.tenant_id AND source.is_active=true AND source.deleted_at IS NULL
         JOIN roles r ON r.role_id=source.role_id AND r.role_name='Faculty'
         WHERE b.viewer_user_id=$1 AND b.tenant_id=$2 AND b.enabled=true
           AND source.dept_id=$3`,
        [user.user_id, payload.tenantId, user.dept_id],
      );
      if (rows.length !== 1) throw new UnauthorizedException('Academic observer access is disabled');
      return {
        user_id: user.user_id, email: user.email, name: user.name,
        role: 'Faculty', roles: ['Faculty'], primaryRole: 'Faculty',
        tenant_id: payload.tenantId, tenant_schema: payload.tenantSchema ?? 'public',
        dept_id: user.dept_id, department: user.department?.dept_name,
        onboarding_status: user.onboarding_status,
        read_only_faculty_source_id: rows[0].source_user_id,
        read_only_academic_view: true,
      };
    }

    await this.authService.syncMultiHatWorkspaceRoles(user.user_id);
    const refreshedUser =
      (await this.authService.loadUserWithSyncedWorkspaceRoles(
        user.user_id,
        payload.tenantId,
      )) ?? user;

    await this.authService.applyLeadershipClaims(refreshedUser,payload.office_context);
    const roleClaims = this.authService.getRoleClaims(refreshedUser);

    const baseUser = {
      user_id: refreshedUser.user_id,
      email: refreshedUser.email,
      name: refreshedUser.name,
      role: roleClaims.primaryRole,
      roles: roleClaims.roles,
      primaryRole: roleClaims.primaryRole,
      office_context: refreshedUser.office_context,
      role_id: refreshedUser.role_id,
      department: refreshedUser.department?.dept_name,
      dept_id: refreshedUser.dept_id,
      tenant_id: payload.tenantId,
      tenant_schema: payload.tenantSchema ?? 'public',
      onboarding_status: normalizeOnboardingStatusForWizard(
        refreshedUser.onboarding_status,
        roleClaims.primaryRole,
      ),
    };

    if (payload.impersonator_user_id) {
      return {
        ...baseUser,
        impersonator_user_id: payload.impersonator_user_id,
        read_only_impersonation: payload.read_only_impersonation === true,
        impersonation_session_id: payload.impersonation_session_id,
      };
    }

    if (roleClaims.roles.some((r) => r.toLowerCase() === 'parent')) {
      const parentMobile = await this.authService.resolveParentMobile(
        payload.tenantId,
        user.email,
      );
      if (parentMobile) {
        return {
          ...baseUser,
          auth_type: 'parent',
          parent_mobile: parentMobile,
        };
      }
    }

    return baseUser;
  }
}
