'use strict';
// Pure preparation validation. No Docker calls, file/config loading or network.
const path = require('node:path');
const IMAGE_KEYS = ['POSTGRES', 'REDIS', 'MAILPIT', 'APP', 'NODE'].map(
  (name) => `NOTIFICATION_STAGING_${name}_IMAGE`,
);
function reviewPlan(env) {
  const rejected = [];
  for (const key of IMAGE_KEYS) {
    const value = env[key];
    if (
      typeof value !== 'string' ||
      !/^[\w./:-]+@sha256:[a-f0-9]{64}$/.test(value)
    ) {
      if (
        !(
          key === 'NOTIFICATION_STAGING_APP_IMAGE' &&
          /^sha256:[a-f0-9]{64}$/.test(value || '')
        )
      )
        rejected.push(key);
    }
  }
  const node = /^node:22\.(\d+)\.\d+-bookworm-slim@sha256:[a-f0-9]{64}$/.exec(
    env.NOTIFICATION_STAGING_NODE_IMAGE || '',
  );
  if (!node || Number(node[1]) < 13)
    rejected.push('NOTIFICATION_STAGING_NODE_IMAGE');
  if (
    !/^postgres:16(?:[.\w-]*)@sha256:[a-f0-9]{64}$/.test(
      env.NOTIFICATION_STAGING_POSTGRES_IMAGE || '',
    )
  )
    rejected.push('NOTIFICATION_STAGING_POSTGRES_IMAGE');
  const files = ['RUNTIME_CONFIG', 'POSTGRES_PASSWORD', 'REDIS_ACL'].map(
    (name) => `NOTIFICATION_STAGING_${name}_FILE`,
  );
  const paths = [];
  for (const key of files) {
    const value = env[key];
    if (
      typeof value !== 'string' ||
      !path.isAbsolute(value) ||
      /[\r\n\0]/.test(value) ||
      /(?:^|\/)\.env(?:[./]|$)/.test(value) ||
      path.normalize(value).startsWith('/Users/apple/Desktop/Falcon/Falcon/')
    )
      rejected.push(key);
    else paths.push(path.normalize(value));
  }
  if (new Set(paths).size !== files.length)
    rejected.push('distinct private configuration files');
  try {
    require('./ingress.cjs').frontendOrigin(
      env.NOTIFICATION_STAGING_FRONTEND_URL,
    );
  } catch {
    rejected.push('NOTIFICATION_STAGING_FRONTEND_URL');
  }
  return {
    status: rejected.length ? 'BLOCKED' : 'PREPARED_ONLY',
    missingOrUnsafe: [...new Set(rejected)],
    runtimeImagesVerified: false,
    resourcesCreated: false,
    databaseExecuted: false,
    deliveryVerified: false,
  };
}
module.exports = { reviewPlan, IMAGE_KEYS };
if (require.main === module) {
  if (process.argv.slice(2).join(' ') !== '--offline') {
    console.error('Only --offline preparation review is allowed');
    process.exitCode = 1;
  } else {
    const result = reviewPlan(process.env);
    console.log(JSON.stringify(result));
    if (result.status === 'BLOCKED') process.exitCode = 1;
  }
}
