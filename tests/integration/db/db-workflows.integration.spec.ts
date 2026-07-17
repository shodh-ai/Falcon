import { withTestClient } from '../../helpers/db';
import { describeLiveDb } from '../../helpers/live-api';
import { testEnv } from '../../helpers/env';

describeLiveDb('Database workflow readiness', () => {
  it('has schema_migrations applied', async () => {
    await withTestClient(async (client) => {
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'schema_migrations'`,
      );
      expect(Number(rows[0]?.count ?? 0)).toBeGreaterThan(0);
    });
  });

  it('can query users table for tenant isolation checks', async () => {
    await withTestClient(async (client) => {
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'users'`,
      );
      const hasUsers = Number(rows[0]?.count ?? 0) > 0;
      if (!hasUsers) return;
      const users = await client.query(
        `SELECT user_id, tenant_id FROM users LIMIT 5`,
      );
      expect(Array.isArray(users.rows)).toBe(true);
      for (const row of users.rows as Array<{ tenant_id: string }>) {
        expect(row.tenant_id).toBeTruthy();
      }
    });
  });

  it('uses dedicated test database name', () => {
    expect(testEnv().db.database).toBe('falcon_test');
  });
});
