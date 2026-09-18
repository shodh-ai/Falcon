import { readFileSync } from 'fs';
import { join } from 'path';

describe('production container healthcheck', () => {
  const script = readFileSync(
    join(process.cwd(), 'scripts', 'healthcheck.js'),
    'utf8',
  );
  const dockerfile = readFileSync(
    join(process.cwd(), 'Dockerfile'),
    'utf8',
  );

  it('checks the local API response and expected health payload', () => {
    expect(script).toContain("http://127.0.0.1:4000/health");
    expect(script).toContain("JSON.parse(body).status === 'ok'");
    expect(script).toContain('response.statusCode === 200');
    expect(script).toContain('request.setTimeout(4000');
  });

  it('uses the same bundled script for the Docker healthcheck', () => {
    expect(dockerfile).toContain('CMD node scripts/healthcheck.js');
  });
});
