/** Set only after the hardened launcher verifies the staging storage and DB. */
export function isVerifiedStaging(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.FALCON_ENVIRONMENT === 'staging' &&
    env.FALCON_STAGING_VERIFIED === '1' && env.NODE_ENV === 'production' &&
    env.DB_HOST === 'falcon-staging-postgres' &&
    env.DB_DATABASE === 'falcon_staging' &&
    env.DB_USERNAME === 'falcon_staging_runtime';
}
