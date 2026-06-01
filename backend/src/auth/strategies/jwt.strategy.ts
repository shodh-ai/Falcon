import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
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

  async validate(payload: AuthTokenPayload) {
    if (!payload.tenantId) {
      throw new UnauthorizedException('Token missing tenant context');
    }

    const user = await this.authService.findById(payload.sub, payload.tenantId);

    if (!user) {
      throw new UnauthorizedException();
    }

    if (!user.is_active) {
      throw new UnauthorizedException('User account is inactive');
    }

    const roleClaims = this.authService.getRoleClaims(user);

    return {
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
    };
  }
}
