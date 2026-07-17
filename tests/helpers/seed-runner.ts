import { spawnSync } from 'child_process';
import path from 'path';
import { isTestDatabaseAvailable } from './db';
import { testEnv } from './env';

/**
 * Apply backend SQL migrations to the test database.
 * Delegates to backend/scripts/run-migrations.js with env from .env.test.
 */
export async function runTestMigrations(): Promise<{ ok: boolean; message: string }> {
  const available = await isTestDatabaseAvailable();
  if (!available) {
    return { ok: false, message: 'Test database is not reachable' };
  }

  const backendDir = path.join(__dirname, '..', '..', 'backend');
  const env = testEnv();
  const result = spawnSync('node', ['scripts/run-migrations.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DB_HOST: env.db.host,
      DB_PORT: String(env.db.port),
      DB_USERNAME: env.db.user,
      DB_PASSWORD: env.db.password,
      DB_DATABASE: env.db.database,
    },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return {
      ok: false,
      message: result.stderr || result.stdout || 'Migration failed',
    };
  }
  return { ok: true, message: 'Migrations applied' };
}

/** Optional idempotent seed for integration tests (Phase B). */
export async function runTestSeed(): Promise<{ ok: boolean; message: string }> {
  const backendDir = path.join(__dirname, '..', '..', 'backend');
  const env = testEnv();
  const result = spawnSync('node', ['scripts/run-migrations.js', '--seed'], {
    cwd: backendDir,
    env: {
      ...process.env,
      DB_HOST: env.db.host,
      DB_PORT: String(env.db.port),
      DB_USERNAME: env.db.user,
      DB_PASSWORD: env.db.password,
      DB_DATABASE: env.db.database,
    },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return { ok: false, message: result.stderr || 'Seed failed' };
  }
  return { ok: true, message: 'Seed applied' };
}
