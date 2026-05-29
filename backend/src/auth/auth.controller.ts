import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
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

@Controller('auth')
export class AuthController {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private authService: AuthService,
    private tenantService: TenantService,
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
  getProfile(@Req() req: Request) {
    return req.user;
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
      relations: ['role', 'department'],
    });

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found for tenant ${subdomain}`);
    }

    if (!user.is_active) {
      throw new UnauthorizedException('User account is inactive');
    }

    const token = this.authService.signToken(user, tenant.tenant_id, tenant.pg_schema);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }
}
