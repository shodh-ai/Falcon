'use strict';

// Invoked by the guarded launcher, before Nest or any worker is imported.
// Staging keeps NODE_ENV=production; this is a deployment boundary, not a
// development-mode shortcut. The protected storage policy is host-authored.
const TARGETS = Object.freeze({
  DB_HOST: 'falcon-staging-postgres', DB_PORT: '5432',
  DB_DATABASE: 'falcon_staging', DB_USERNAME: 'falcon_staging_runtime',
  DB_SYNCHRONIZE: 'false', DB_POOL_MAX: '5',
  REDIS_HOST: 'falcon-staging-redis', REDIS_PORT: '6379', REDIS_TLS: 'false',
  EMAIL_HOST: 'falcon-staging-mail', EMAIL_PORT: '1025', EMAIL_SECURE: 'false',
  NODE_EXTRA_CA_CERTS: '/run/falcon/staging-smtp-ca.pem',
  FRONTEND_URL: 'https://staging-falcon.jataka.io',
  DEFAULT_TENANT_SUBDOMAIN: 'staging',
  DEDICATED_APP_HOSTS: 'staging-falcon.jataka.io,staging-apifalcon.jataka.io',
  AUTH_PROVIDER: 'local', ALLOW_MOCK_PAYMENTS: 'true',
  STAGING_INTEGRATIONS_MODE: 'mock',
  PORTAL_EMAIL_DELIVERY_ENABLED: 'true',
  PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED: 'false',
});
const FORBIDDEN = /^(?:DATABASE_URL$|REDIS_URL$|PG(?:HOST|PORT|DATABASE|USER|PASSWORD)$|GOOGLE_|KEYCLOAK_|AWS_|S3_|SMTP_|SMS_|TWILIO_|MSG91_|RESEND_|SENDGRID_|RAZORPAY_|PAYU_|FIREBASE_|OPENAI_|ANTHROPIC_|GEMINI_|DATABASE_ENV$|DEPLOYMENT_ENV$)|(?:WEBHOOK|_API_KEY$)/;
function assertStagingBoundary({env=process.env, storage}={}) {
  const db=storage?.baseline?.database;
  const hinted=env.FALCON_ENVIRONMENT==='staging' ||
    db?.name==='falcon_staging' || String(db?.host || '').startsWith('falcon-staging-');
  if (!hinted) {
    if (env.FALCON_ENVIRONMENT && env.FALCON_ENVIRONMENT!=='production') throw Error('Unknown deployment environment');
    return false;
  }
  const fail=()=>{throw Error('Staging deployment boundary refused; application was not started');};
  if (env.FALCON_ENVIRONMENT!=='staging' || env.NODE_ENV!=='production') fail();
  for (const [key,value] of Object.entries(TARGETS)) if (env[key]!==value) fail();
  if (!db || db.host!==TARGETS.DB_HOST || db.name!==TARGETS.DB_DATABASE ||
      db.role!==TARGETS.DB_USERNAME || db.port!==5432 || db.enforce_least_privilege!==true) fail();
  const uploads=storage.baseline.upload_mounts;
  if (!Array.isArray(uploads) || uploads.length!==1 ||
      uploads[0].destination!=='/app/uploads' || uploads[0].mount_root!=='/data/falcon-staging/uploads') fail();
  if (!storage.baseline.readonly_mounts?.some(x=>x.destination===TARGETS.NODE_EXTRA_CA_CERTS &&
      x.mount_root==='/data/falcon-staging/private/smtp-ca.pem' && x.kind==='file')) fail();
  if (!storage.baseline.readonly_mounts?.some(x=>x.destination==='/run/falcon/staging-access' &&
      x.mount_root==='/data/falcon-staging/private/access' && x.kind==='directory')) fail();
  if (!/^[0-9a-f]{16}$/.test(env.FALCON_RELEASE_ID || '')) fail();
  if (env.UPLOAD_PATH!=='/app/uploads' || env.DB_USER || env.REDIS_USERNAME) fail();
  for (const [key,value] of Object.entries(env)) {
    if (!value) continue;
    if (FORBIDDEN.test(key)) fail();
    if (key.endsWith('_URL') && !['FRONTEND_URL'].includes(key)) fail();
  }
  for (const key of ['DB_PASSWORD','REDIS_PASSWORD','JWT_SECRET','EMAIL_PASSWORD']) {
    if (typeof env[key]!=='string' || env[key].length<32) fail();
  }
  if (new Set(['DB_PASSWORD','REDIS_PASSWORD','JWT_SECRET','EMAIL_PASSWORD'].map(k=>env[k])).size!==4) fail();
  if (env.PORTAL_NOTIFICATION_QUEUE_PREFIX!=='falcon-notification-staging') fail();
  return true;
}
module.exports={assertStagingBoundary,TARGETS};
