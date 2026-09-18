#!/usr/bin/env node
const http = require('http');

const request = http.get('http://127.0.0.1:4000/health', (response) => {
  let body = '';
  response.setEncoding('utf8');
  response.on('data', (chunk) => {
    body += chunk;
  });
  response.on('end', () => {
    let healthy = response.statusCode === 200;
    try {
      healthy = healthy && JSON.parse(body).status === 'ok';
    } catch {
      healthy = false;
    }
    process.exit(healthy ? 0 : 1);
  });
});

request.setTimeout(4000, () => {
  request.destroy(new Error('Falcon healthcheck timed out'));
});
request.on('error', () => process.exit(1));
