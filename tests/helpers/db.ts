import { Client, type ClientConfig } from 'pg';
import { testEnv } from './env';

export function getTestDbConfig(): ClientConfig {
  const { db } = testEnv();
  if (process.env.TEST_DATABASE_URL) {
    return { connectionString: process.env.TEST_DATABASE_URL };
  }
  return {
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
  };
}

export async function withTestClient<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(getTestDbConfig());
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Ping test database; returns false if unreachable. */
export async function isTestDatabaseAvailable(): Promise<boolean> {
  try {
    await withTestClient(async (client) => {
      await client.query('SELECT 1');
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset test data between integration runs.
 * Truncates application tables in public schema (keeps schema_migrations).
 * Only runs when FALCON_RESET_DB=1 and FALCON_TEST_DB=1.
 */
export async function resetTestDatabase(): Promise<void> {
  const env = testEnv();
  if (!env.testDbEnabled || !env.resetDb) return;

  await withTestClient(async (client) => {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename NOT IN ('schema_migrations')`,
    );
    if (!rows.length) return;

    const tableList = rows.map((r) => `"${r.tablename}"`).join(', ');
    await client.query(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`);
  });
}
