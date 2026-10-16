#!/usr/bin/env node
const http = require('http');

/** All requests remain loopback-only; dependency probes never send notification mail. */
function checkHealth(env = process.env, get = http.get) {
  const port = env.PORT ?? '4000';
  if (!['string', 'number'].includes(typeof port) ||
      !/^[1-9]\d{0,4}$/.test(String(port)) || Number(port) > 65535)
    return Promise.resolve(false);
  const paths = ['/health'];
  if (env.PORTAL_EMAIL_DELIVERY_ENABLED === 'true') paths.push('/health/notifications');
  return new Promise((resolve) => {
    let complete = false;
    let outstanding = paths.length;
    const requests = [];
    const finish = (healthy) => {
      if (complete) return;
      complete = true;
      clearTimeout(timeout);
      for (const request of requests) request.destroy();
      resolve(healthy);
    };
    // Both routes share the same deadline, below the existing Docker 5s limit.
    const timeout = setTimeout(() => finish(false), 4000);
    for (const path of paths) {
      if (complete) break;
      try {
        const request = get({ hostname: '127.0.0.1', port: Number(port), path }, (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            body += chunk;
            if (body.length > 4096) finish(false);
          });
          response.on('error', () => finish(false));
          response.on('aborted', () => finish(false));
          response.on('end', () => {
            let healthy = response.statusCode === 200;
            try { healthy = healthy && JSON.parse(body).status === 'ok'; }
            catch { healthy = false; }
            if (!healthy) finish(false);
            else if (--outstanding === 0) finish(true);
          });
        });
        requests.push(request);
        request.on('error', () => finish(false));
      } catch { finish(false); }
    }
  });
}

module.exports = { checkHealth };
if (require.main === module)
  void checkHealth().then((healthy) => { process.exitCode = healthy ? 0 : 1; });
