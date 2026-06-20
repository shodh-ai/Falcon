import { Injectable, Logger } from '@nestjs/common';
import type { User } from '../../entities/user.entity';
import type { IAuthProvider } from '../interfaces/auth-provider.interface';
import { LocalAuthProvider } from './local-auth.provider';

/**
 * Phase 2: replace delegation with Keycloak OIDC token exchange.
 * Keeps the same IAuthProvider contract for AuthService consumers.
 */
@Injectable()
export class KeycloakAuthProvider implements IAuthProvider {
  readonly providerId = 'keycloak';
  private readonly logger = new Logger(KeycloakAuthProvider.name);

  constructor(private readonly localFallback: LocalAuthProvider) {}

  signToken(user: User, tenantId: string, tenantSchema: string): string {
    if (!process.env.KEYCLOAK_REALM) {
      return this.localFallback.signToken(user, tenantId, tenantSchema);
    }
    this.logger.warn(
      'Keycloak is configured but not yet wired — using local JWT',
    );
    return this.localFallback.signToken(user, tenantId, tenantSchema);
  }

  validateDomainForTenant(email: string, allowedDomains: string[]): boolean {
    return this.localFallback.validateDomainForTenant(email, allowedDomains);
  }
}
