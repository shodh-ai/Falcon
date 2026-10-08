import fs from 'fs';
import path from 'path';

/** Load tests/.env.test into process.env (does not override existing vars). */
export function loadTestEnv(): void {
  const envPath = path.join(__dirname, '..', '.env.test');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

export function testEnv() {
  return {
    nodeEnv: process.env.NODE_ENV ?? 'test',
    db: {
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      user: process.env.DB_USERNAME ?? process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_DATABASE ?? 'falcon_test',
    },
    apiUrl: process.env.FALCON_API_URL ?? 'http://localhost:4000',
    webUrl: process.env.FALCON_WEB_URL ?? 'http://localhost:3000',
    tenant: process.env.FALCON_TENANT ?? 'sgvu',
    testDbEnabled: process.env.FALCON_TEST_DB === '1',
    resetDb: process.env.FALCON_RESET_DB === '1',
    liveApi: process.env.FALCON_LIVE_API === '1',
    liveE2e: process.env.FALCON_E2E_LIVE === '1',
  };
}
