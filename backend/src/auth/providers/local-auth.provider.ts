import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../../entities/user.entity';
import type { AuthTokenPayload, IAuthProvider } from '../interfaces/auth-provider.interface';

@Injectable()
export class LocalAuthProvider implements IAuthProvider {
  readonly providerId = 'local-google-jwt';

  constructor(private readonly jwtService: JwtService) {}

  signToken(user: User, tenantId: string, tenantSchema: string): string {
    const payload: AuthTokenPayload = {
      sub: user.user_id,
      email: user.email,
      role: user.role?.role_name,
      name: user.name,
      tenantId,
      tenantSchema,
    };
    return this.jwtService.sign(payload);
  }

  validateDomainForTenant(email: string, allowedDomains: string[]): boolean {
    if (!allowedDomains.length) return true;
    const domain = email.split('@')[1]?.toLowerCase();
    return allowedDomains.some((d) => domain === d.toLowerCase());
  }
}
