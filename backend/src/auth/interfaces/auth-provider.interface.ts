import type { User } from '../../entities/user.entity';

export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role?: string;
  roles?: string[];
  primaryRole?: string;
  name: string;
  tenantId: string;
  tenantSchema: string;
  authType?: 'parent' | 'staff';
  impersonator_user_id?: string;
  read_only_impersonation?: boolean;
  impersonation_session_id?: string;
}

export interface AuthenticatedUser {
  user: User;
  token: string;
}

/**
 * Pluggable authentication (Google today, Keycloak tomorrow).
 */
export interface IAuthProvider {
  readonly providerId: string;

  signToken(user: User, tenantId: string, tenantSchema: string): string;

  validateDomainForTenant(email: string, allowedDomains: string[]): boolean;
}
