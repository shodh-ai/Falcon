'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { safetyConfig, assertLocalDockerApi, identifier, redact, writeReport } = require('./core.cjs');
const safe = { NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: '5433', DB_DATABASE: 'university_governance', FALCON_SMOKE_ENABLE: '1' };
test('requires explicit safe local configuration', () => assert.equal(safetyConfig(safe).db.database, 'university_governance'));
for (const [name, patch] of Object.entries({ production: { NODE_ENV: 'production' }, remote: { DB_HOST: 'database.example.com' }, unconfirmed: { FALCON_SMOKE_ENABLE: '0' }, wrongDb: { DB_DATABASE: 'production' }, wrongPort: { DB_PORT: '5432' }, remoteApi: { FALCON_SMOKE_API_URL: 'https://example.com' }, otherLocalApi: { FALCON_SMOKE_API_URL: 'http://localhost:4000' } })) {
  test(`rejects ${name}`, () => assert.throws(() => safetyConfig({ ...safe, ...patch })));
}
test('restricts identifiers', () => { assert.equal(identifier('student_profiles'), '"student_profiles"'); assert.throws(() => identifier('users;DELETE')); });
test('redacts credentials in reports', () => assert.deepEqual(redact({ password: 'secret', child: { access_token: 'secret', title: 'Synthetic' } }), { password: '<redacted>', child: { access_token: '<redacted>', title: 'Synthetic' } }));

const normalDocker = () => [
  {
    Name: '/backend-falcon-api-1', Id: 'local-api-id', Image: 'local-image-id',
    State: { Running: true, Health: { Status: 'healthy' } },
    Config: {
      Env: ['FALCON_LOCAL_DOCKER=1', 'NODE_ENV=production', 'DB_SYNCHRONIZE=false', 'DB_HOST=postgres', 'DB_PORT=5432', 'DB_DATABASE=university_governance'],
      Cmd: ['node', 'dist/main.js'],
      Labels: { 'com.docker.compose.project': 'backend', 'com.docker.compose.service': 'falcon-api' },
    },
    HostConfig: { PortBindings: { '4000/tcp': [{ HostIp: '127.0.0.1', HostPort: '4000' }] } },
    NetworkSettings: { Networks: { falcon_default: {} } },
  },
  {
    Name: '/falcon-postgres-1', State: { Running: true },
    Config: { Env: ['POSTGRES_DB=university_governance'], Labels: { 'com.docker.compose.project': 'falcon' } },
    HostConfig: { PortBindings: { '5432/tcp': [{ HostPort: '5433' }] } },
    NetworkSettings: { Networks: { falcon_default: {} } },
  },
];
const normalConfig = () => safetyConfig({ ...safe, FALCON_SMOKE_NORMAL_DOCKER: '1' });
test('normal backend requires explicit opt-in and verified local container identity', () => {
  const config = normalConfig();
  assert.equal(config.api, 'http://127.0.0.1:4000');
  assert.equal(config.apiMode, 'local-docker');
  assert.equal(assertLocalDockerApi(normalDocker(), config).containerId, 'local-api-id');
  assert.throws(() => safetyConfig({ ...safe, FALCON_SMOKE_NORMAL_DOCKER: '1', FALCON_SMOKE_API_URL: 'http://example.com:4000' }));
});
for (const [label, alter] of [
  ['unhealthy API', (c) => { c[0].State.Health.Status = 'unhealthy'; }],
  ['missing local marker', (c) => { c[0].Config.Env = c[0].Config.Env.filter(v => !v.startsWith('FALCON_LOCAL_DOCKER=')); }],
  ['weaker authentication mode', (c) => { c[0].Config.Env = c[0].Config.Env.map(v => v === 'NODE_ENV=production' ? 'NODE_ENV=development' : v); }],
  ['remote database', (c) => { c[0].Config.Env = c[0].Config.Env.map(v => v === 'DB_HOST=postgres' ? 'DB_HOST=production.example.com' : v); }],
  ['schema synchronization', (c) => { c[0].Config.Env = c[0].Config.Env.map(v => v === 'DB_SYNCHRONIZE=false' ? 'DB_SYNCHRONIZE=true' : v); }],
  ['non-loopback exposure', (c) => { c[0].HostConfig.PortBindings['4000/tcp'][0].HostIp = '0.0.0.0'; }],
  ['different database volume target', (c) => { c[1].Config.Env = ['POSTGRES_DB=other_database']; }],
  ['different database port', (c) => { c[1].HostConfig.PortBindings['5432/tcp'][0].HostPort = '5432'; }],
  ['different Docker network', (c) => { c[0].NetworkSettings.Networks = { production: {} }; }],
  ['test server instead of normal API', (c) => { c[0].Config.Cmd = ['node', 'scripts/student-smoke/server.cjs']; }],
]) {
  test(`normal-backend test refuses ${label}`, () => {
    const containers = normalDocker(); alter(containers);
    assert.throws(() => assertLocalDockerApi(containers, normalConfig()));
  });
}

test('report history retains previous evidence and never persists credentials', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-smoke-report-test-'));
  try {
    const first = writeReport({ completed: true, password: 'not-a-real-password', tests: [{ status: 'PASS' }] }, directory);
    const second = writeReport({ completed: false, access_token: 'not-a-real-token', tests: [{ status: 'FAIL' }] }, directory);
    assert.notEqual(first, second);
    assert.equal(JSON.parse(fs.readFileSync(first, 'utf8')).completed, true);
    assert.equal(JSON.parse(fs.readFileSync(second, 'utf8')).completed, false);
    const latest = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8'));
    assert.equal(latest.evidenceFile, second);
    assert.equal(latest.access_token, '<redacted>');
    assert.equal(JSON.parse(fs.readFileSync(first, 'utf8')).password, '<redacted>');
  } finally {
    // Delete only the exact newly-created test directory, never application data.
    if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('falcon-smoke-report-test-'))
      fs.rmSync(directory, { recursive: true });
  }
});
