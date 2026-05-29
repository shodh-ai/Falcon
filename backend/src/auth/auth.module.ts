import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { AUTH_PROVIDER } from './interfaces/auth-provider.interface';
import { LocalAuthProvider } from './providers/local-auth.provider';
import { KeycloakAuthProvider } from './providers/keycloak-auth.provider';
import { AuthTenantCookieMiddleware } from './middleware/auth-tenant-cookie.middleware';

const authProviderFactory = {
  provide: AUTH_PROVIDER,
  useFactory: (local: LocalAuthProvider, keycloak: KeycloakAuthProvider) => {
    const mode = process.env.AUTH_PROVIDER ?? 'local';
    return mode === 'keycloak' ? keycloak : local;
  },
  inject: [LocalAuthProvider, KeycloakAuthProvider],
};

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET') || 'default-secret-key',
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRATION') || '7d',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalAuthProvider,
    KeycloakAuthProvider,
    authProviderFactory,
    GoogleStrategy,
    JwtStrategy,
  ],
  exports: [AuthService, AUTH_PROVIDER],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthTenantCookieMiddleware).forRoutes('auth/google');
  }
}
