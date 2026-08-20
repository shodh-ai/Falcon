import { ConfigService } from '@nestjs/config';

const DEV_FALLBACK = 'default-secret-key';

/**
 * Resolve JWT signing/verification secret.
 * Production must set JWT_SECRET — never fall back to a hardcoded value there.
 */
export function resolveJwtSecret(config: ConfigService): string {
  const secret = (config.get<string>('JWT_SECRET') ?? '').trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set when NODE_ENV=production');
  }
  return DEV_FALLBACK;
}
