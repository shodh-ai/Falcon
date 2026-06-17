import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request, Response } from 'express';
import { User } from '../entities/user.entity';
import { Public } from '../common/decorators/roles.decorator';
import { AuthService } from './auth.service';
import { TenantService } from '../tenant/tenant.service';
import { HrEntityContextService } from '../modules/hr/hr-entity-context.service';
import { normalizeOnboardingStatusForWizard } from '../modules/student-onboarding/onboarding-portal.util';
import { LocalLoginDto } from './dto/local-login.dto';

type AuthProfileUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  roles?: string[];
};

@Controller(['auth', 'api/auth'])
export class AuthController {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private authService: AuthService,
    private tenantService: TenantService,
    private hrEntityCtx: HrEntityContextService,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Initiates Google OAuth flow
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(@Req() req: { user: { token: string } }, @Res() res: Response) {
    const { token } = req.user;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@Req() req: Request & { user: AuthProfileUser }) {
    return this.buildProfilePayload(req.user);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getMe(@Req() req: Request & { user: AuthProfileUser }) {
    return this.buildProfilePayload(req.user);
  }

  @Get('me/permissions')
  @UseGuards(AuthGuard('jwt'))
  async getMyPermissions(@Req() req: Request & { user: AuthProfileUser }) {
    const payload = await this.buildProfilePayload(req.user);
    return {
      permissions: payload.permissions,
      hr_capabilities: payload.hr_capabilities,
      allowed_entities: payload.allowed_entities,
    };
  }

  private async buildProfilePayload(user: AuthProfileUser) {
    const dbUser = await this.userRepository.findOne({
      where: { user_id: user.user_id },
      select: ['onboarding_status'],
    });
    const caps = user.tenant_id
      ? await this.hrEntityCtx.getPermissions(user.tenant_id, user.user_id)
      : null;
    const permissions = this.hrEntityCtx.capabilitiesToPermissionList(caps);
    const roles = user.roles?.length ? user.roles : user.role ? [user.role] : [];
    const allowedRows = user.tenant_id
      ? await this.hrEntityCtx.listAllowedEntities(user.tenant_id, user.user_id, roles)
      : [];
    const primaryRole = user.primaryRole ?? user.role ?? roles[0];
    return {
      ...user,
      onboarding_status: normalizeOnboardingStatusForWizard(
        dbUser?.onboarding_status ?? 'ACTIVE',
        primaryRole,
      ),
      hr_capabilities: caps ?? {},
      permissions,
      allowed_entities: this.hrEntityCtx.formatAllowedEntities(allowedRows),
    };
  }

  @Public()
  @Post('local-login')
  async localLogin(
    @Body() dto: LocalLoginDto,
    @Headers('x-tenant-subdomain') tenantSubdomain: string | undefined,
  ) {
    return this.authService.localLogin(dto.email, dto.password, tenantSubdomain);
  }

  @Public()
  @Get('dev-login/:email')
  async devLogin(
    @Param('email') email: string,
    @Headers('x-tenant-subdomain') tenantSubdomain: string | undefined,
    @Res() res: Response,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Dev login is disabled in production');
    }

    const subdomain = tenantSubdomain ?? process.env.DEFAULT_TENANT_SUBDOMAIN ?? 'sgvu';
    const tenant = await this.tenantService.findBySubdomain(subdomain);

    const user = await this.userRepository.findOne({
      where: { email, tenant_id: tenant.tenant_id },
      relations: ['role', 'department', 'userRoles', 'userRoles.role'],
    });

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found for tenant ${subdomain}`);
    }

    if (!user.is_active) {
      throw new UnauthorizedException('User account is inactive');
    }

    await this.authService.ensurePrimaryRoleMapping(user);
    const refreshed = await this.authService.findById(user.user_id, tenant.tenant_id);
    const token = this.authService.signToken(refreshed ?? user, tenant.tenant_id, tenant.pg_schema);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }
}
