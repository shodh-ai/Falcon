import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { User } from '../../entities/user.entity';
import { Role } from '../../entities/role.entity';
import { AuthService } from '../auth.service';
import { TenantService } from '../../tenant/tenant.service';
import { resolveAllowedEmailDomains } from '../utils/resolve-allowed-domains';
import { getInitialOnboardingStatusForRole } from '../../modules/student-onboarding/onboarding-portal.util';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    private authService: AuthService,
    private tenantService: TenantService,
  ) {
    super({
      clientID: configService.get('GOOGLE_CLIENT_ID') || 'local-placeholder-client-id',
      clientSecret: configService.get('GOOGLE_CLIENT_SECRET') || 'local-placeholder-client-secret',
      callbackURL:
        configService.get('GOOGLE_CALLBACK_URL') ||
        'http://localhost:4000/auth/google/callback',
      scope: ['profile', 'email'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: { headers?: Record<string, string | string[] | undefined> },
    _accessToken: string,
    _refreshToken: string,
    profile: { name: { givenName: string; familyName: string }; emails: { value: string }[]; id: string },
    done: VerifyCallback,
  ): Promise<void> {
    const { name, emails, id } = profile;
    const email = emails[0].value;

    const reqWithCookies = req as Request & { cookies?: Record<string, string> };
    const subdomain =
      reqWithCookies.cookies?.tenant_subdomain ??
      (typeof req.headers?.['x-tenant-subdomain'] === 'string'
        ? req.headers['x-tenant-subdomain']
        : null) ??
      process.env.DEFAULT_TENANT_SUBDOMAIN ??
      'sgvu';

    const tenant = await this.tenantService.findBySubdomain(subdomain);
    const allowedDomains = resolveAllowedEmailDomains(
      tenant,
      this.configService.get('ALLOWED_DOMAIN'),
    );

    if (!this.authService.validateDomainForTenant(email, allowedDomains)) {
      throw new UnauthorizedException(
        `Email domain not allowed for ${tenant.name}. Allowed: ${allowedDomains.join(', ')}`,
      );
    }

    let user = await this.userRepository.findOne({
      where: { email, tenant_id: tenant.tenant_id },
      relations: ['role', 'department', 'userRoles', 'userRoles.role'],
    });

    if (!user) {
      const existing = await this.userRepository.findOne({
        where: { email },
        relations: ['role', 'department', 'userRoles', 'userRoles.role'],
      });
      if (existing) {
        existing.tenant_id = tenant.tenant_id;
        user = await this.userRepository.save(existing);
      }
    }

    if (!user) {
      const defaultRole = await this.roleRepository.findOne({
        where: { role_name: 'Faculty' },
      });

      user = this.userRepository.create({
        name: `${name.givenName} ${name.familyName}`,
        email,
        google_id: id,
        role_id: defaultRole?.role_id,
        is_active: true,
        tenant_id: tenant.tenant_id,
        onboarding_status: getInitialOnboardingStatusForRole(defaultRole?.role_name),
      });

      user = await this.userRepository.save(user);
      user = await this.userRepository.findOne({
        where: { user_id: user.user_id },
        relations: ['role', 'department', 'userRoles', 'userRoles.role'],
      });
    } else if (!user.google_id) {
      user.google_id = id;
      await this.userRepository.save(user);
    }

    if (!user) {
      throw new UnauthorizedException('Could not create or locate user account');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('User account is inactive');
    }

    await this.authService.ensurePrimaryRoleMapping(user);
    const refreshed = await this.authService.findById(user.user_id, tenant.tenant_id);
    const token = this.authService.signToken(refreshed ?? user, tenant.tenant_id, tenant.pg_schema);
    done(null, { user, token, tenant });
  }
}
