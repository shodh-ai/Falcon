import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { assertInvitedStaging } from '../../common/config/staging-invites';
import type { User } from '../../entities/user.entity';
import type {
  AuthTokenPayload,
  IAuthProvider,
} from '../interfaces/auth-provider.interface';

@Injectable()
export class LocalAuthProvider implements IAuthProvider {
  readonly providerId = 'local-google-jwt';

  constructor(private readonly jwtService: JwtService) {}

  signToken(user: User, tenantId: string, tenantSchema: string): string {
    assertInvitedStaging(user.user_id, tenantId);
    const roleClaims = this.getRoleClaims(user);
    const payload: AuthTokenPayload = {
      sub: user.user_id,
      email: user.email,
      role: roleClaims.primaryRole,
      roles: roleClaims.roles,
      primaryRole: roleClaims.primaryRole,
      name: user.name,
      tenantId,
      tenantSchema,
      leadership_auth_revision: user.leadership_auth_revision ?? 0,
      office_context: user.office_context,
    };
    return this.jwtService.sign(payload);
  }

  validateDomainForTenant(email: string, allowedDomains: string[]): boolean {
    if (!allowedDomains.length) return true;
    const domain = email.split('@')[1]?.toLowerCase();
    return allowedDomains.some((d) => domain === d.toLowerCase());
  }

  private getRoleClaims(user: User): { roles: string[]; primaryRole?: string } {
    if(user.leadership_roles)return user.leadership_roles;
    const mappedRoles = (user.userRoles ?? [])
      .filter((row) => row.role?.role_name)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((row) => row.role.role_name);
    const roles =
      mappedRoles.length > 0 ? Array.from(new Set(mappedRoles)) : [];
    if (user.role?.role_name && !roles.includes(user.role.role_name)) {
      roles.unshift(user.role.role_name);
    }
    return {
      roles,
      primaryRole:
        user.userRoles?.find((row) => row.is_primary)?.role?.role_name ??
        user.role?.role_name ??
        roles[0],
    };
  }
}
