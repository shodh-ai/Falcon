const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { checkHealth } = require('./healthcheck.js');

function harness(replies = {}) {
  const calls = [];
  const requests = [];
  const get = (options, callback) => {
    calls.push(options);
    const request = Object.assign(new EventEmitter(), { destroy() { this.destroyed = true; } });
    requests.push(request);
    queueMicrotask(() => {
      const reply = replies[options.path];
      if (reply === 'error') { request.emit('error', Error('private detail')); return; }
      if (reply === 'throw-response') return;
      const response = Object.assign(new EventEmitter(), { statusCode: reply?.status ?? 200, setEncoding() {} });
      callback(response);
      response.emit('data', reply?.body ?? '{"status":"ok"}');
      if (reply === 'aborted') response.emit('aborted');
      else response.emit('end');
    });
    return request;
  };
  return { calls, requests, get };
}

test('preserves disabled-mode liveness and loopback default port', async () => {
  const h = harness();
  assert.equal(await checkHealth({}, h.get), true);
  assert.deepEqual(h.calls, [{ hostname: '127.0.0.1', port: 4000, path: '/health' }]);
});
test('enabled mode requires both liveness and notification readiness at validated PORT', async () => {
  const h = harness();
  assert.equal(await checkHealth({ PORT: '4100', PORTAL_EMAIL_DELIVERY_ENABLED: 'true' }, h.get), true);
  assert.deepEqual(h.calls, ['/health', '/health/notifications'].map(path => ({ hostname: '127.0.0.1', port: 4100, path })));
});
test('non-exact enable values do not change existing health behavior', async () => {
  for (const value of ['false', 'TRUE', '1', true, undefined]) {
    const h = harness();
    assert.equal(await checkHealth({ PORTAL_EMAIL_DELIVERY_ENABLED: value }, h.get), true);
    assert.equal(h.calls.length, 1);
  }
});
test('unavailable/malformed notification readiness fails without following redirects', async () => {
  for (const reply of [{ status: 503 }, { status: 302 }, { body: 'private error' }, { body: '{"status":"disabled"}' }, { body: 'x'.repeat(4097) }, 'error', 'aborted']) {
    const h = harness({ '/health/notifications': reply });
    assert.equal(await checkHealth({ PORTAL_EMAIL_DELIVERY_ENABLED: 'true' }, h.get), false);
    assert.equal(h.calls.length, 2);
    assert.ok(h.requests.every(request => request.destroyed));
  }
});
test('invalid ports fail before any connection can be created', async () => {
  for (const port of ['4000/path', '04000', 0, -1, 65536, 'smtp.example.invalid', {}, 4002.5]) {
    const h = harness();
    assert.equal(await checkHealth({ PORT: port }, h.get), false);
    assert.equal(h.calls.length, 0);
  }
});
test('synchronous connector failure stays sanitized and fails closed', async () => {
  assert.equal(await checkHealth({}, () => { throw Error('private connection detail'); }), false);
});
