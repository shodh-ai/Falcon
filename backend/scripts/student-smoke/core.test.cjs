'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { safetyConfig, identifier, redact, writeReport } = require('./core.cjs');
const safe = { NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: '5433', DB_DATABASE: 'university_governance', FALCON_SMOKE_ENABLE: '1' };
test('requires explicit safe local configuration', () => assert.equal(safetyConfig(safe).db.database, 'university_governance'));
for (const [name, patch] of Object.entries({ production: { NODE_ENV: 'production' }, remote: { DB_HOST: 'database.example.com' }, unconfirmed: { FALCON_SMOKE_ENABLE: '0' }, wrongDb: { DB_DATABASE: 'production' }, wrongPort: { DB_PORT: '5432' }, remoteApi: { FALCON_SMOKE_API_URL: 'https://example.com' }, otherLocalApi: { FALCON_SMOKE_API_URL: 'http://localhost:4000' } })) {
  test(`rejects ${name}`, () => assert.throws(() => safetyConfig({ ...safe, ...patch })));
}
test('restricts identifiers', () => { assert.equal(identifier('student_profiles'), '"student_profiles"'); assert.throws(() => identifier('users;DELETE')); });
test('redacts credentials in reports', () => assert.deepEqual(redact({ password: 'secret', child: { access_token: 'secret', title: 'Synthetic' } }), { password: '<redacted>', child: { access_token: '<redacted>', title: 'Synthetic' } }));

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
