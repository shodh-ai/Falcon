import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { normalizeOnboardingStatusForWizard } from '../../modules/student-onboarding/onboarding-portal.util';
import type { AuthTokenPayload } from '../interfaces/auth-provider.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET') || 'default-secret-key',
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

    const roleClaims = this.authService.getRoleClaims(user);

    const baseUser = {
      user_id: user.user_id,
      email: user.email,
      name: user.name,
      role: roleClaims.primaryRole,
      roles: roleClaims.roles,
      primaryRole: roleClaims.primaryRole,
      role_id: user.role_id,
      department: user.department?.dept_name,
      dept_id: user.dept_id,
      tenant_id: payload.tenantId,
      tenant_schema: payload.tenantSchema ?? 'public',
      onboarding_status: normalizeOnboardingStatusForWizard(
        user.onboarding_status,
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
