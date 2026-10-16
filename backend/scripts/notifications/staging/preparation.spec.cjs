'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const {
  allowed,
  headersFor,
  frontendOrigin,
  createIngress,
  TARGET,
} = require('./ingress.cjs');
const { reviewPlan, IMAGE_KEYS } = require('./review-plan.cjs');

test('only reviewed notification/auth routes and Engine.IO are proxied', () => {
  for (const p of [
    '/health',
    '/api/notifications?limit=50',
    '/api/auth/me',
    '/api/auth/profile',
    '/api/tenants/resolve/notification-staging',
  ])
    assert.equal(allowed('GET', p), true);
  assert.equal(allowed('POST', '/api/auth/local-login'), true);
  assert.equal(allowed('GET', '/auth/profile'), false);
  assert.equal(
    allowed(
      'PATCH',
      '/api/notifications/00000000-0000-4000-8000-000000000001/read',
    ),
    true,
  );
  assert.equal(
    allowed('PATCH', `/api/notifications/${'-'.repeat(36)}/read`),
    false,
  );
  assert.equal(
    allowed('GET', '/socket.io/?EIO=4&transport=websocket', true),
    true,
  );
  assert.equal(
    allowed('POST', '/socket.io/?EIO=4&transport=polling&sid=syntheticSession'),
    true,
  );
});
test('proxy refuses other services, recovery, traversal, token queries and arbitrary upgrades', () => {
  for (const p of [
    'http://production.invalid/',
    '//outside.invalid/',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/uploads',
    '/api/tenants/resolve/sgvu',
    '/api/notifications/../auth/me',
    '/api/%6eotifications',
    '/socket.io/?EIO=4&transport=websocket&token=private',
    '/socket.io/?EIO=4&transport=polling&url=https://other.invalid',
    '/socket.io/?EIO=4&EIO=4&transport=websocket',
    '/api/notifications?limit=1000',
  ])
    assert.equal(allowed('GET', p), false, p);
  assert.equal(allowed('CONNECT', '/health'), false);
  assert.equal(allowed('GET', '/health', true), false);
  assert.equal(
    allowed('POST', '/socket.io/?EIO=4&transport=polling', true),
    false,
  );
});
test('fixed upstream and header allowlist never use client forwarding identity', () => {
  assert.deepEqual(TARGET, { hostname: '172.30.71.5', port: 4110 });
  const h = headersFor({
    origin: 'https://notification-staging.example.test',
    authorization: 'mock',
    'x-forwarded-host': 'external.invalid',
    'x-forwarded-for': 'private',
    'x-tenant-id': 'forged',
    host: 'external.invalid',
    'x-tenant-subdomain': 'notification-staging',
  });
  assert.deepEqual(Object.keys(h).sort(), [
    'authorization',
    'origin',
    'x-tenant-subdomain',
  ]);
});
test('HTTPS canonical staging origin only', () => {
  assert.equal(
    frontendOrigin('https://notification-staging.example.test'),
    'https://notification-staging.example.test',
  );
  for (const v of [
    undefined,
    'http://127.0.0.1:3001',
    'https://x.test/',
    'https://u:p@x.test',
    'https://x.test/path',
  ])
    assert.throws(() => frontendOrigin(v));
});
test('synchronous upstream failures produce sanitized 502 or close upgrade without a connection', () => {
  const origin = 'https://notification-staging.example.test';
  // A server object only: never listen or perform any network request.
  const server = createIngress(origin, () => {
    throw Error('private upstream detail');
  });
  const req = Object.assign(new EventEmitter(), {
    method: 'GET',
    url: '/health',
    headers: { origin },
  });
  let status, body;
  const res = Object.assign(new EventEmitter(), {
    headersSent: false,
    writeHead(value) {
      status = value;
    },
    end(value) {
      body = value;
    },
  });
  assert.doesNotThrow(() => server.emit('request', req, res));
  assert.equal(status, 502);
  assert.equal(body, 'Staging upstream unavailable');
  let destroyed = false;
  const socket = Object.assign(new EventEmitter(), {
    destroy() {
      destroyed = true;
    },
  });
  const upgrade = {
    method: 'GET',
    url: '/socket.io/?EIO=4&transport=websocket',
    headers: { origin, upgrade: 'websocket' },
  };
  assert.doesNotThrow(() =>
    server.emit('upgrade', upgrade, socket, Buffer.alloc(0)),
  );
  assert.equal(destroyed, true);
});
const digest = 'a'.repeat(64); // Mock metadata only, never presented as a real image.
const valid = {
  NOTIFICATION_STAGING_POSTGRES_IMAGE: `postgres:16-bookworm@sha256:${digest}`,
  NOTIFICATION_STAGING_REDIS_IMAGE: `redis:7-bookworm@sha256:${digest}`,
  NOTIFICATION_STAGING_MAILPIT_IMAGE: `axllent/mailpit:v1.31.1@sha256:${digest}`,
  NOTIFICATION_STAGING_APP_IMAGE: `sha256:${digest}`,
  NOTIFICATION_STAGING_NODE_IMAGE: `node:22.13.1-bookworm-slim@sha256:${digest}`,
  NOTIFICATION_STAGING_RUNTIME_CONFIG_FILE: '/private/review/staging.conf',
  NOTIFICATION_STAGING_POSTGRES_PASSWORD_FILE:
    '/private/review/postgres.secret',
  NOTIFICATION_STAGING_REDIS_ACL_FILE: '/private/review/redis.acl',
  NOTIFICATION_STAGING_FRONTEND_URL:
    'https://notification-staging.example.test',
};
test('plan validation never claims actual runtime/SQL/delivery verification', () => {
  const p = reviewPlan(valid);
  assert.equal(p.status, 'PREPARED_ONLY');
  assert.equal(p.runtimeImagesVerified, false);
  assert.equal(p.resourcesCreated, false);
  assert.equal(p.databaseExecuted, false);
  assert.equal(p.deliveryVerified, false);
  for (const key of IMAGE_KEYS)
    assert.equal(
      reviewPlan({ ...valid, [key]: 'floating:latest' }).status,
      'BLOCKED',
    );
  assert.equal(
    reviewPlan({
      ...valid,
      NOTIFICATION_STAGING_NODE_IMAGE: `node:20-bookworm-slim@sha256:${digest}`,
    }).status,
    'BLOCKED',
  );
});
test('plan rejects shared .env, original checkout config, missing and shared secret files', () => {
  for (const f of [
    '.env',
    '/private/review/.env',
    '/Users/apple/Desktop/Falcon/Falcon/backend/.env',
    'relative.conf',
  ])
    assert.equal(
      reviewPlan({ ...valid, NOTIFICATION_STAGING_RUNTIME_CONFIG_FILE: f })
        .status,
      'BLOCKED',
    );
  assert.equal(reviewPlan({}).status, 'BLOCKED');
  assert.equal(
    reviewPlan({
      ...valid,
      NOTIFICATION_STAGING_REDIS_ACL_FILE:
        valid.NOTIFICATION_STAGING_RUNTIME_CONFIG_FILE,
    }).status,
    'BLOCKED',
  );
});
test('review Compose is disabled by default with only loopback ingress publication', () => {
  const y = fs.readFileSync(`${__dirname}/compose.review.yml`, 'utf8');
  assert.match(y, /profiles: \[reviewed-notification-staging\]/);
  assert.match(y, /internal: true/);
  assert.match(y, /gateway_mode_ipv4: isolated/);
  assert.equal((y.match(/^\s+ports:/gm) || []).length, 1);
  assert.match(y, /127\.0\.0\.1:4111:4111/);
  assert.doesNotMatch(
    y,
    /external: true|docker\.sock|network_mode: host|\/Users\/apple/,
  );
  assert.match(y, /MP_SMTP_RELAY_ALL: 'false'/);
  assert.match(y, /MP_WEBHOOK_URL: ''/);
  assert.match(y, /MP_MAX_MESSAGES: '0'/);
  const docker = fs.readFileSync(`${__dirname}/Dockerfile.review`, 'utf8');
  assert.match(docker, /npm ci/);
  assert.doesNotMatch(docker, /COPY \. \.|db:migrate|COPY.*\.env/);
  assert.match(docker, /dist\/notifications-staging\/main.js/);
});
