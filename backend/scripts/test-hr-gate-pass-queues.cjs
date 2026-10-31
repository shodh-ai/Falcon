'use strict';
require('reflect-metadata');
const assert = require('node:assert/strict');
const { DataSource } = require('typeorm');
const { HrService } = require('../dist/modules/hr/hr.service');

async function main() {
  if (process.env.FALCON_TEST_DB !== '1' || !['/tmp', 'localhost', '127.0.0.1'].includes(process.env.DB_HOST)) {
    throw new Error('Explicit local fixture database required; production is prohibited');
  }
  const db = new DataSource({ type: 'postgres', host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
    entities: [], synchronize: false, logging: false });
  await db.initialize();
  const qr = db.createQueryRunner();
  const tenant = '10000000-0000-4000-8000-000000000001';
  const actor = '20000000-0000-4000-8000-000000000001';
  const staff = '20000000-0000-4000-8000-000000000002';
  const hod = '20000000-0000-4000-8000-000000000003';
  try {
    await qr.connect(); await qr.startTransaction();
    await qr.query(`
      CREATE TEMP TABLE users (user_id uuid, tenant_id uuid, name text, official_email text, dept_id int, entity_id int);
      CREATE TEMP TABLE hr_employee_profiles (user_id uuid, tenant_id uuid, entity_id int);
      CREATE TEMP TABLE departments (dept_id int, dept_name text);
      CREATE TEMP TABLE staff_gate_passes (pass_id uuid, tenant_id uuid, staff_user_id uuid, reporting_officer_id uuid,
        out_time timestamp, expected_in_time timestamp, reason text, status text, created_at timestamptz DEFAULT now());
      CREATE TEMP TABLE hr_access_controls (tenant_id uuid, user_id uuid, module_name text, can_view bool, can_approve bool,
        entity_scope int[], department_scope int[]);
    `);
    await qr.query(`INSERT INTO users VALUES ($1,$2,'Synthetic Faculty','test@example.invalid',43,7)`, [staff, tenant]);
    await qr.query('INSERT INTO hr_employee_profiles VALUES ($1,$2,7)', [staff, tenant]);
    await qr.query(`INSERT INTO departments VALUES (43,'Pharmacy')`);
    await qr.query(`INSERT INTO staff_gate_passes (pass_id,tenant_id,staff_user_id,reporting_officer_id,out_time,expected_in_time,reason,status) VALUES
      ('30000000-0000-4000-8000-000000000001',$1,$2,$3,now(),now(),'fixture','PENDING'),
      ('30000000-0000-4000-8000-000000000002',$1,$2,$3,now(),now(),'fixture','PENDING_HR')`, [tenant, staff, hod]);
    const service = Object.assign(Object.create(HrService.prototype), {
      users: { manager: { query: (sql, params) => qr.query(sql, params) } },
      workflowRouting: { getHrAdmin: async () => ({ userId: actor }) },
    });
    let rows = await service.listHrGatePassReviews(tenant, 7, actor);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.created_at instanceof Date && Number.isFinite(row.created_at.getTime())));
    assert.equal(rows.find(row => row.status === 'PENDING').can_review, false);
    assert.equal(rows.find(row => row.status === 'PENDING_HR').can_review, true);
    assert.equal((await service.listHrGatePassReviews(tenant, 8, actor)).length, 0);
    assert.equal((await service.listHrGatePassReviews('10000000-0000-4000-8000-000000000009', 7, actor)).length, 0);
    assert.ok((await service.listHrGatePassReviews(tenant, 7, hod)).every(row => !row.can_review));
    await qr.query(`INSERT INTO hr_access_controls VALUES ($1,$2,'LEAVES',true,true,ARRAY[7],ARRAY[99])`, [tenant, actor]);
    assert.equal((await service.listHrGatePassReviews(tenant, 7, actor)).length, 0);
    await qr.query('UPDATE hr_access_controls SET department_scope=ARRAY[43],can_approve=false');
    rows = await service.listHrGatePassReviews(tenant, 7, actor);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => !row.can_review));
    console.log('PASS: PostgreSQL gate-pass stage, assignment, tenant, entity, department and approval-power isolation. TEMP fixtures only.');
  } finally {
    if (qr.isTransactionActive) await qr.rollbackTransaction();
    await qr.release(); await db.destroy();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
