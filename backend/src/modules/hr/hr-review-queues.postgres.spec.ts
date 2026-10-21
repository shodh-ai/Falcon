import { Client } from 'pg';
import { HrWorkforceService } from './hr-workforce.service';
import { HrTeamService } from './hr-team.service';

// Opt-in local integration test. Every table is TEMP and the transaction is
// rolled back; no production/ordinary table is read or mutated.
const postgresTest = process.env.HR_QA_PG_URL ? describe : describe.skip;
postgresTest('HR pending queues against PostgreSQL', () => {
  let client: Client;
  const tenant = '10000000-0000-4000-8000-000000000001';
  const actor = '20000000-0000-4000-8000-000000000001';
  const manager = '20000000-0000-4000-8000-000000000002';
  const staff = '20000000-0000-4000-8000-000000000003';
  const query = async (sql: string, params?: unknown[]) => (await client.query(sql, params)).rows;
  let workforce: HrWorkforceService;
  let team: HrTeamService;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.HR_QA_PG_URL });
    await client.connect();
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE users (user_id uuid, tenant_id uuid, name text, official_email text, dept_id int, entity_id int);
      CREATE TEMP TABLE hr_employee_profiles (user_id uuid, tenant_id uuid, employee_id text, entity_id int);
      CREATE TEMP TABLE staff_leave_requests (leave_id uuid, tenant_id uuid, staff_user_id uuid, entity_id int,
        request_type text, leave_type text, workflow_id uuid, current_step_order int, current_approver_user_id uuid,
        start_date date, end_date date, regularization_date date, missed_punch_type text, start_time time, end_time time,
        reason text, status text, applied_at timestamptz);
      CREATE TEMP TABLE hr_approval_workflow_steps (step_id uuid, workflow_id uuid, step_order int, approver_type text, approver_ref text);
      CREATE TEMP TABLE hr_daily_attendance (user_id uuid, date date, first_in_time timestamptz, last_out_time timestamptz);
      CREATE TEMP TABLE hr_staff_request_decisions (tenant_id uuid, leave_id uuid, actor_user_id uuid, action text);
      CREATE TEMP TABLE hr_access_controls (tenant_id uuid, user_id uuid, module_name text, can_view bool, can_approve bool,
        entity_scope int[], department_scope int[]);
    `);
    workforce = new HrWorkforceService({} as never, {} as never, {} as never, {} as never, {} as never,
      { manager: { connection: { query } } } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    team = new HrTeamService({ query } as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  });
  afterAll(async () => { if (client) { await client.query('ROLLBACK'); await client.end(); } });
  beforeEach(async () => {
    await client.query('TRUNCATE users, hr_employee_profiles, staff_leave_requests, hr_staff_request_decisions, hr_access_controls');
    await query('INSERT INTO users VALUES ($1,$2,\'Employee\',\'test@example.invalid\',43,7), ($3,$2,\'HR reviewer\',\'hr@example.invalid\',43,7)', [staff, tenant, actor]);
    await query('INSERT INTO hr_employee_profiles VALUES ($1,$2,\'EMP1\',7)', [staff, tenant]);
    await query(`INSERT INTO staff_leave_requests
      (leave_id,tenant_id,staff_user_id,entity_id,request_type,leave_type,current_step_order,current_approver_user_id,status,start_date,end_date,regularization_date,applied_at)
      VALUES ('30000000-0000-4000-8000-000000000001',$1,$2,7,'REGULARIZATION','REGULARIZATION',1,$3,'PENDING','2026-10-10','2026-10-10','2026-10-10',now()),
      ('30000000-0000-4000-8000-000000000002',$1,$2,7,'REGULARIZATION','REGULARIZATION',2,$4,'HOD_APPROVED','2026-10-11','2026-10-11','2026-10-11',now()),
      ('30000000-0000-4000-8000-000000000003',$1,$2,7,'LEAVE','CL',1,$3,'PENDING','2026-10-12','2026-10-12',null,now())`, [tenant, staff, manager, actor]);
  });

  it('shows both regularization stages while enabling actions only on the assigned final stage', async () => {
    const rows = await workforce.listHrReviewPending(tenant, 7, actor, 'REGULARIZATION', true);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.review_stage === 'FIRST_LEVEL')?.can_review).toBe(false);
    expect(rows.find((row) => row.review_stage === 'FINAL_HR')?.can_review).toBe(true);
    const actionable = await workforce.listHrReviewPending(tenant, 7, actor, 'REGULARIZATION');
    expect(actionable).toHaveLength(1);
    expect(await workforce.listHrReviewPending(tenant, 8, actor, 'REGULARIZATION', true)).toEqual([]);
    expect(await workforce.listHrReviewPending('10000000-0000-4000-8000-000000000009', 7, actor, 'REGULARIZATION', true)).toEqual([]);
  });

  it('supervises both stages but does not offer a previous approver final approval', async () => {
    await query(`INSERT INTO hr_staff_request_decisions VALUES ($1,'30000000-0000-4000-8000-000000000002',$2,'APPROVE')`, [tenant, actor]);
    const rows = await workforce.listHrReviewPending(tenant, 7, actor, 'REGULARIZATION', true);
    expect(rows.find((row) => row.review_stage === 'FINAL_HR')?.can_review).toBe(false);
    const pending = await team.listAllPendingForAdmin(tenant, 7, actor);
    expect(pending.count).toBe(3);
    expect(pending.items.find((row) => row.review_stage === 'FINAL_HR')?.can_override_approve).toBe(false);
  });

  it('applies explicit department and entity restrictions to HR administrative queues', async () => {
    await query(`INSERT INTO hr_access_controls VALUES ($1,$2,'LEAVES',true,true,ARRAY[7],ARRAY[99])`, [tenant, actor]);
    expect(await workforce.listHrReviewPending(tenant, 7, actor, 'REGULARIZATION', true)).toEqual([]);
    expect((await team.listAllPendingForAdmin(tenant, 7, actor)).count).toBe(0);
    await query('UPDATE hr_access_controls SET department_scope = ARRAY[43], entity_scope = ARRAY[8]');
    expect((await team.listAllPendingForAdmin(tenant, 7, actor)).count).toBe(0);
  });
});
