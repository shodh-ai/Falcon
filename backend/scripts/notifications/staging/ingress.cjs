'use strict';
// Disabled until explicit reviewed container execution. Never logs requests.
const http = require('node:http');
const dns = require('node:dns/promises');
const fs = require('node:fs');
const TARGET = Object.freeze({ hostname: '172.30.71.5', port: 4110 });
const GET = new Set([
  '/health',
  '/api/auth/me',
  '/api/auth/profile',
  '/api/tenants/resolve/notification-staging',
  '/api/auth/me/permissions',
  '/api/notifications',
  '/api/notifications/recent',
  '/api/notifications/unread-count',
]);
const POST = new Set([
  '/api/auth/local-login',
  '/api/notifications/mark-all-read',
]);
const NOTIFICATION_ACTION =
  /^\/api\/notifications\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(read|dismiss)$/;

function frontendOrigin(value) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      value !== u.origin ||
      u.username ||
      u.password ||
      ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    )
      throw Error();
    return u.origin;
  } catch {
    throw Error('Approved staging HTTPS origin required');
  }
}
function allowed(method, raw, upgrade = false) {
  if (
    typeof raw !== 'string' ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    /[\\\s%#]/.test(raw) ||
    raw.includes('..')
  )
    return false;
  const url = new URL(raw, 'http://ingress.invalid');
  if (url.pathname === '/socket.io/') {
    if (!['GET', 'POST'].includes(method)) return false;
    const keys = [...url.searchParams.keys()];
    if (
      new Set(keys).size !== keys.length ||
      keys.some((k) => !['EIO', 'transport', 'sid', 't'].includes(k)) ||
      url.searchParams.get('EIO') !== '4' ||
      !['polling', 'websocket'].includes(url.searchParams.get('transport'))
    )
      return false;
    if (
      url.searchParams.get('sid') &&
      !/^[\w-]{8,128}$/.test(url.searchParams.get('sid'))
    )
      return false;
    if (
      url.searchParams.get('t') &&
      !/^[\w-]{1,64}$/.test(url.searchParams.get('t'))
    )
      return false;
    return (
      !upgrade ||
      (method === 'GET' && url.searchParams.get('transport') === 'websocket')
    );
  }
  if (upgrade) return false;
  if (
    [...url.searchParams.keys()].some((k) => k !== 'limit') ||
    url.searchParams.getAll('limit').length > 1 ||
    (url.searchParams.has('limit') &&
      !/^(?:[1-9]\d?|100)$/.test(url.searchParams.get('limit')))
  )
    return false;
  if (method === 'OPTIONS')
    return (
      GET.has(url.pathname) ||
      POST.has(url.pathname) ||
      NOTIFICATION_ACTION.test(url.pathname)
    );
  return (
    (method === 'GET' && GET.has(url.pathname)) ||
    (method === 'POST' && POST.has(url.pathname)) ||
    (method === 'PATCH' && NOTIFICATION_ACTION.test(url.pathname))
  );
}
function headersFor(headers, upgrade = false) {
  const safe = {};
  const names = [
    'accept',
    'content-type',
    'content-length',
    'authorization',
    'cookie',
    'origin',
    'x-tenant-subdomain',
    'access-control-request-method',
    'access-control-request-headers',
  ];
  if (upgrade)
    names.push(
      'sec-websocket-key',
      'sec-websocket-version',
      'sec-websocket-extensions',
      'sec-websocket-protocol',
    );
  for (const key of names)
    if (headers[key] !== undefined) safe[key] = headers[key];
  if (upgrade) {
    safe.connection = 'Upgrade';
    safe.upgrade = 'websocket';
  }
  return safe;
}
function createIngress(origin, connect = http.request) {
  origin = frontendOrigin(origin);
  const server = http.createServer((req, res) => {
    if (
      !allowed(req.method, req.url) ||
      (req.headers.origin && req.headers.origin !== origin)
    ) {
      res.writeHead(403);
      res.end('Staging route unavailable');
      return;
    }
    let upstream;
    try {
      upstream = connect(
        {
          ...TARGET,
          method: req.method,
          path: req.url,
          headers: headersFor(req.headers),
        },
        (reply) => {
          res.writeHead(reply.statusCode || 502, reply.headers);
          reply.on('error', () => res.destroy());
          reply.pipe(res);
        },
      );
      upstream.setTimeout(25_000, () => upstream.destroy());
      upstream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(502);
          res.end('Staging upstream unavailable');
        } else res.destroy();
      });
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > 16_384) {
          upstream.destroy();
          if (!res.headersSent) {
            res.writeHead(413);
            res.end('Staging request too large');
          }
        } else upstream.write(chunk);
      });
      req.on('end', () => upstream.end());
      req.on('aborted', () => upstream.destroy());
      res.on('close', () => upstream.destroy());
    } catch {
      upstream?.destroy();
      if (!res.headersSent) {
        res.writeHead(502);
        res.end('Staging upstream unavailable');
      } else res.destroy();
    }
  });
  server.on('upgrade', (req, socket, head) => {
    if (
      req.headers.upgrade?.toLowerCase() !== 'websocket' ||
      req.headers.origin !== origin ||
      !allowed(req.method, req.url, true)
    ) {
      socket.destroy();
      return;
    }
    let upstream;
    try {
      upstream = connect({
        ...TARGET,
        method: 'GET',
        path: req.url,
        headers: headersFor(req.headers, true),
      });
      upstream.setTimeout(10_000, () => upstream.destroy());
      upstream.on('error', () => socket.destroy());
      upstream.on('response', (response) => {
        response.resume();
        socket.destroy();
      });
      upstream.on('upgrade', (response, peer, receivedHead) => {
        if (response.statusCode !== 101) {
          peer.destroy();
          socket.destroy();
          return;
        }
        peer.setTimeout(0);
        socket.write('HTTP/1.1 101 Switching Protocols\r\n');
        for (let i = 0; i < response.rawHeaders.length; i += 2)
          socket.write(
            `${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}\r\n`,
          );
        socket.write('\r\n');
        if (receivedHead.length) socket.write(receivedHead);
        if (head.length) peer.write(head);
        peer.on('error', () => socket.destroy());
        socket.on('error', () => peer.destroy());
        socket.on('close', () => peer.destroy());
        peer.on('close', () => socket.destroy());
        peer.pipe(socket);
        socket.pipe(peer);
      });
      socket.on('close', () => upstream.destroy());
      upstream.end();
    } catch {
      upstream?.destroy();
      socket.destroy();
    }
  });
  server.on('connect', (_req, socket) => socket.destroy());
  server.headersTimeout = 10_000;
  server.requestTimeout = 25_000;
  return server;
}
async function main() {
  if (
    process.argv.slice(2).join(' ') !==
      '--reviewed-notification-staging-ingress' ||
    process.platform !== 'linux' ||
    !fs.existsSync('/.dockerenv')
  )
    throw Error();
  const addresses = await dns.lookup('falcon-notification-staging-backend', {
    all: true,
  });
  if (
    addresses.length !== 1 ||
    addresses[0].address !== TARGET.hostname ||
    addresses[0].family !== 4
  )
    throw Error();
  createIngress(process.env.NOTIFICATION_STAGING_FRONTEND_URL).listen(
    4111,
    '0.0.0.0',
  );
}
module.exports = { allowed, headersFor, frontendOrigin, createIngress, TARGET };
if (require.main === module)
  void main().catch(() => {
    console.error('Staging ingress refused (CONFIGURATION)');
    process.exitCode = 1;
  });
