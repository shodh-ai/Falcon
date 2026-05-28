import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Role } from '../../entities/role.entity';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    private jwtService: JwtService,
  ) {
    super({
      clientID: configService.get('GOOGLE_CLIENT_ID') || 'local-placeholder-client-id',
      clientSecret: configService.get('GOOGLE_CLIENT_SECRET') || 'local-placeholder-client-secret',
      callbackURL:
        configService.get('GOOGLE_CALLBACK_URL') ||
        'http://localhost:4000/auth/google/callback',
      scope: ['profile', 'email'],
      passReqToCallback: false,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { name, emails, id } = profile;
    const email = emails[0].value;
    const allowedDomain = this.configService.get('ALLOWED_DOMAIN');

    // Check if email domain is allowed
    if (!email.endsWith(`@${allowedDomain}`)) {
      throw new UnauthorizedException(
        `Only @${allowedDomain} emails are allowed to access this system`,
      );
    }

    // Find or create user
    let user = await this.userRepository.findOne({
      where: { email },
      relations: ['role', 'department'],
    });

    if (!user) {
      // Create new user with default role (Faculty)
      const defaultRole = await this.roleRepository.findOne({
        where: { role_name: 'Faculty' },
      });

      user = this.userRepository.create({
        name: name.givenName + ' ' + name.familyName,
        email,
        google_id: id,
        role_id: defaultRole?.role_id,
        is_active: true,
      });

      user = await this.userRepository.save(user);
    } else {
      // Update google_id if not set
      if (!user.google_id) {
        user.google_id = id;
        await this.userRepository.save(user);
      }
    }

    // Check if user is active
    if (!user.is_active) {
      throw new UnauthorizedException('User account is inactive');
    }

    // Generate JWT token
    const payload = {
      sub: user.user_id,
      email: user.email,
      role: user.role?.role_name,
      name: user.name,
    };

    const token = this.jwtService.sign(payload);

    done(null, { user, token });
  }
}
