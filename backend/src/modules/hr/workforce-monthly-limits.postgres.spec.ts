import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { EntityManager } from 'typeorm';
import { assertWorkforceMonthlyApprovalLimit } from './workforce-monthly-limits';

const suite = process.env.FALCON_TEST_DB === '1' ? describe : describe.skip;
suite('Monthly approved workforce limits (isolated PostgreSQL)', () => {
  const schema = `workforce_limits_${randomUUID().replace(/-/g, '')}`;
  const tenant = randomUUID();
  const staff = randomUUID();
  let client: Client;
  let created = false;
  const connect = async () => {
    const url = new URL(process.env.TEST_DATABASE_URL || 'http://invalid');
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/falcon_examcell_test')
      throw new Error('Only the explicitly marked local disposable database may be used');
    const c = new Client({ connectionString: url.toString() });
    await c.connect();
    const { rows } = await c.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()");
    if (rows[0]?.marker !== 'falcon-examcell-disposable-integration-20261021') {
      await c.end();
      throw new Error('Disposable database marker required');
    }
    await c.query(`SET search_path TO ${schema}`);
    return c;
  };
  const manager = (c: Client) => ({
    query: async (sql: string, args: unknown[]) => (await c.query(sql, args)).rows,
  }) as EntityManager;
  beforeAll(async () => {
    client = await connect();
    await client.query(`CREATE SCHEMA ${schema}`);
    created = true;
    await client.query(`CREATE TABLE staff_leave_requests (
      leave_id uuid PRIMARY KEY, tenant_id uuid, staff_user_id uuid,
      request_type text, status text, applied_at timestamptz);
      CREATE TABLE hr_staff_request_appeals (leave_id uuid, tenant_id uuid,
      requester_user_id uuid, status text, created_at timestamptz);`);
  });
  afterAll(async () => {
    if (created) await client.query(`DROP SCHEMA ${schema} CASCADE`);
    if (client) await client.end();
  });
  beforeEach(async () => { await client.query('TRUNCATE staff_leave_requests,hr_staff_request_appeals'); });
  const add = async (status = 'PENDING', type = 'REGULARIZATION', date = '2026-10-15T00:00:00Z', person = staff, org = tenant) => {
    const id = randomUUID();
    await client.query('INSERT INTO staff_leave_requests VALUES($1,$2,$3,$4,$5,$6)', [id, org, person, type, status, date]);
    return id;
  };
  const appeal = async (status: string, date = '2026-10-16T00:00:00Z') => {
    const id = await add(status === 'APPROVED' ? 'HR_APPROVED' : 'PENDING', 'LEAVE');
    await client.query('INSERT INTO hr_staff_request_appeals VALUES($1,$2,$3,$4,$5)', [id, tenant, staff, status, date]);
    return id;
  };
  const approve = async (id: string, c = client) => {
    await c.query('BEGIN');
    try {
      await assertWorkforceMonthlyApprovalLimit(manager(c), tenant, staff, id);
      await c.query("UPDATE staff_leave_requests SET status='HR_APPROVED' WHERE leave_id=$1", [id]);
      await c.query("UPDATE hr_staff_request_appeals SET status='APPROVED' WHERE leave_id=$1", [id]);
      await c.query('COMMIT');
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    }
  };
  it('allows three final approvals and blocks a fourth without approving it', async () => {
    for (let i = 0; i < 3; i++) await approve(await add());
    const fourth = await add();
    await expect(approve(fourth)).rejects.toThrow('3 approved regularization');
    expect((await client.query('SELECT status FROM staff_leave_requests WHERE leave_id=$1', [fourth])).rows[0].status).toBe('PENDING');
  });
  it('excludes pending, rejected, HOD-only, other employees, tenants and months', async () => {
    for (const status of ['PENDING', 'REJECTED', 'HOD_APPROVED']) await add(status);
    for (let i = 0; i < 3; i++) {
      await add('HR_APPROVED', 'REGULARIZATION', '2026-09-30T18:29:59Z');
      await add('HR_APPROVED', 'REGULARIZATION', undefined, randomUUID());
      await add('HR_APPROVED', 'REGULARIZATION', undefined, staff, randomUUID());
    }
    await expect(approve(await add())).resolves.toBeUndefined();
  });
  it('uses the India calendar boundary, not UTC or the leave date', async () => {
    for (let i = 0; i < 3; i++) await add('HR_APPROVED', 'REGULARIZATION', '2026-09-30T18:30:00Z');
    await expect(approve(await add())).rejects.toThrow('3 approved regularization');
    await expect(approve(await add('PENDING', 'REGULARIZATION', '2026-10-31T18:30:00Z'))).resolves.toBeUndefined();
  });
  it('limits only finally approved leave reconsiderations, independently of regularizations', async () => {
    for (const status of ['PENDING_REVIEW', 'REJECTED', 'PENDING_RECONSIDERATION']) await appeal(status);
    for (let i = 0; i < 3; i++) await approve(await appeal('PENDING_FINAL'));
    await expect(approve(await appeal('PENDING_FINAL'))).rejects.toThrow('3 approved leave reconsiderations');
    await expect(approve(await add())).resolves.toBeUndefined();
    await expect(approve(await add('PENDING', 'LEAVE'))).resolves.toBeUndefined();
  });
  it('serializes competing final approvals for the last monthly slot', async () => {
    await add('HR_APPROVED'); await add('HR_APPROVED');
    const first = await add(); const second = await add();
    const other = await connect();
    try {
      const results = await Promise.allSettled([approve(first), approve(second, other)]);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
      expect(Number((await client.query("SELECT count(*) FROM staff_leave_requests WHERE status='HR_APPROVED'")).rows[0].count)).toBe(3);
    } finally { await other.end(); }
  });
});
