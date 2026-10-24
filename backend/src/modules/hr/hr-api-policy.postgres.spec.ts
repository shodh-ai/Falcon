import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { HrApiPolicyService } from './hr-api-policy.service';
import { apiStarterTemplate } from './hr-api-policy.engine';

const pgTest = process.env.HR_QA_PG_URL ? describe : describe.skip;
pgTest(
  'API policy persistence in isolated PostgreSQL schema (rolled back)',
  () => {
    let client: Client;
    let service: HrApiPolicyService;
    let savepoint = 0;
    const tenant = '10000000-0000-4000-8000-000000000001',
      actor = '20000000-0000-4000-8000-000000000001',
      employee = '20000000-0000-4000-8000-000000000002';
    const scope = { tenantId: tenant, entityId: 7, actorId: actor };
    const query = async (sql: string, params?: unknown[]) =>
      (await client.query(sql, params)).rows;
    const body = () => ({
      designation: 'Assistant Professor',
      assessment_year: 2026,
      title: 'HR approved test sheet',
      sheet: apiStarterTemplate().sheet,
    });
    const inputs = () =>
      Object.fromEntries(
        body().sheet.categories.flatMap((c) =>
          c.metrics.map((m) => [m.key, { value: 0, evidence: '' }]),
        ),
      );
    beforeAll(async () => {
      client = new Client({ connectionString: process.env.HR_QA_PG_URL });
      await client.connect();
      await client.query('BEGIN');
      const schema = `falcon_api_test_${randomUUID().replace(/-/g, '')}`;
      await client.query(
        `CREATE SCHEMA ${schema}; SET LOCAL search_path=${schema},public; SET LOCAL statement_timeout='10000ms'`,
      );
      await client.query(`CREATE TABLE users(user_id uuid,tenant_id uuid,role_id uuid,is_active bool,name text,dept_id int);
      CREATE TABLE roles(role_id uuid,role_name text);CREATE TABLE user_roles(user_id uuid,role_id uuid);
      CREATE TABLE hr_access_controls(tenant_id uuid,user_id uuid,module_name text,can_view bool,can_edit bool,department_scope int[],entity_scope int[]);
      CREATE TABLE hr_employee_profiles(tenant_id uuid,user_id uuid,entity_id int,designation text);`);
      await client.query(
        readFileSync(
          join(
            __dirname,
            '../../../migrations/20261023150000_hr_designation_api_policies.sql',
          ),
          'utf8',
        ),
      );
      await query(`INSERT INTO roles VALUES ('90000000-0000-4000-8000-000000000001','HRAdmin');
      INSERT INTO users VALUES ('${actor}','${tenant}','90000000-0000-4000-8000-000000000001',true,'HR',43),('${employee}','${tenant}','90000000-0000-4000-8000-000000000001',true,'Test Faculty',43);
      INSERT INTO hr_employee_profiles VALUES ('${tenant}','${employee}',7,'Assistant Professor');`);
      service = new HrApiPolicyService({
        query,
        transaction: async (callback: (q: unknown) => Promise<unknown>) => {
          const name = `decision_${++savepoint}`;
          await client.query(`SAVEPOINT ${name}`);
          try {
            const result = await callback({ query });
            await client.query(`RELEASE SAVEPOINT ${name}`);
            return result;
          } catch (error) {
            await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
            await client.query(`RELEASE SAVEPOINT ${name}`);
            throw error;
          }
        },
      } as never);
    });
    afterAll(async () => {
      if (client) {
        await client.query('ROLLBACK');
        await client.end();
      }
    });
    async function published() {
      const p = await service.create(scope, body(), randomUUID());
      return service.publish(scope, p.policy_id, p.revision, {
        acknowledged: true,
        approval_reference: 'Approved by HR policy committee',
      });
    }

    it('creates idempotently without activation and rejects conflicting retries', async () => {
      const key = randomUUID();
      const p = await service.create(scope, body(), key);
      expect(p.status).toBe('DRAFT');
      expect((await service.create(scope, body(), key)).policy_id).toBe(
        p.policy_id,
      );
      await expect(
        service.create(scope, { ...body(), title: 'Different' }, key),
      ).rejects.toThrow('different policy');
      expect(
        (
          await service.preview(scope, {
            policy_id: p.policy_id,
            inputs: inputs(),
          })
        ).calculation.total,
      ).toBe(0);
    });
    it('uses revision checks and immutable published definitions', async () => {
      const p = await service.create(scope, body(), randomUUID());
      const edited = await service.update(scope, p.policy_id, 1, {
        title: 'Edited',
        sheet: body().sheet,
      });
      expect(edited.revision).toBe(2);
      await expect(
        service.update(scope, p.policy_id, 1, {
          title: 'Stale',
          sheet: body().sheet,
        }),
      ).rejects.toThrow('changed');
      await service.publish(scope, p.policy_id, 2, {
        acknowledged: true,
        approval_reference: 'Reviewed and approved by HR',
      });
      await expect(
        service.update(scope, p.policy_id, 3, {
          title: 'Rewrite published',
          sheet: body().sheet,
        }),
      ).rejects.toThrow('published');
      const events = await service.history(scope, p.policy_id);
      expect(events.map((e) => e.action)).toEqual([
        'CREATED',
        'DRAFT_UPDATED',
        'PUBLISHED',
      ]);
    });
    it('requires explicit approval context before publication', async () => {
      const p = await service.create(scope, body(), randomUUID());
      await expect(
        service.publish(scope, p.policy_id, 1, {
          approval_reference: 'No acknowledgment',
        }),
      ).rejects.toThrow('Confirm');
    });
    it('preserves old calculation snapshots when a new version becomes current', async () => {
      const p = await published();
      const key = randomUUID();
      const saved = await service.saveCalculation(
        scope,
        p.policy_id,
        p.revision,
        { employee_user_id: employee, inputs: inputs() },
        key,
      );
      const again = await service.saveCalculation(
        scope,
        p.policy_id,
        p.revision,
        { employee_user_id: employee, inputs: inputs() },
        key,
      );
      expect(again.snapshot_id).toBe(saved.snapshot_id);
      expect(again.sha256).toBe(saved.sha256);
      const next = await published();
      expect(next.version).toBe(p.version + 1);
      const [old] = await query(
        'SELECT snapshot FROM hr_api_calculation_snapshots WHERE snapshot_id=$1',
        [saved.snapshot_id],
      );
      expect(old.snapshot.policy.policy_id).toBe(p.policy_id);
      await expect(
        service.saveCalculation(
          scope,
          p.policy_id,
          p.revision,
          { employee_user_id: employee, inputs: inputs() },
          randomUUID(),
        ),
      ).rejects.toThrow('current published');
      expect(
        (
          await service.saveCalculation(
            scope,
            p.policy_id,
            p.revision,
            { employee_user_id: employee, inputs: inputs() },
            key,
          )
        ).snapshot_id,
      ).toBe(saved.snapshot_id);
    });
    it('rejects incomplete, designation-mismatched and cross-entity calculations', async () => {
      const p = await published();
      await expect(
        service.saveCalculation(
          scope,
          p.policy_id,
          p.revision,
          { employee_user_id: employee, inputs: {} },
          randomUUID(),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          message: expect.arrayContaining([expect.stringContaining('missing')]),
        }),
      });
      const other = await service.create(
        scope,
        { ...body(), designation: 'Professor' },
        randomUUID(),
      );
      const ready = await service.publish(
        scope,
        other.policy_id,
        other.revision,
        { acknowledged: true, approval_reference: 'Approved by HR committee' },
      );
      await expect(
        service.saveCalculation(
          scope,
          ready.policy_id,
          ready.revision,
          { employee_user_id: employee, inputs: inputs() },
          randomUUID(),
        ),
      ).rejects.toThrow('designation');
      await expect(
        service.preview(
          { ...scope, entityId: 8 },
          { policy_id: p.policy_id, inputs: inputs() },
        ),
      ).rejects.toThrow('not found');
      await expect(
        service.preview(
          { ...scope, tenantId: randomUUID() },
          { policy_id: p.policy_id, inputs: inputs() },
        ),
      ).rejects.toThrow('current authorized HR');
    });
    it('honors current roles and explicit delegated policy restrictions', async () => {
      await query(
        `INSERT INTO hr_access_controls VALUES ($1,$2,'POLICIES',true,false,NULL,ARRAY[7])`,
        [tenant, actor],
      );
      await expect(service.create(scope, body(), randomUUID())).rejects.toThrow(
        'delegated',
      );
      expect((await service.list(scope)).can_edit).toBe(false);
      await query('DELETE FROM hr_access_controls');
      await query('UPDATE users SET is_active=false WHERE user_id=$1', [actor]);
      await expect(service.create(scope, body(), randomUUID())).rejects.toThrow(
        'current authorized HR',
      );
      await query('UPDATE users SET is_active=true WHERE user_id=$1', [actor]);
    });
    it('enforces append-only history and published definitions in the database', async () => {
      const p = await published();
      const record = await service.saveCalculation(
        scope,
        p.policy_id,
        p.revision,
        { employee_user_id: employee, inputs: inputs() },
        randomUUID(),
      );
      for (const sql of [
        `UPDATE hr_api_policies SET title='Tampered' WHERE policy_id='${p.policy_id}'`,
        `DELETE FROM hr_api_policy_events WHERE policy_id='${p.policy_id}'`,
        `DELETE FROM hr_api_calculation_snapshots WHERE snapshot_id='${record.snapshot_id}'`,
      ]) {
        await query('SAVEPOINT immutable_check');
        await expect(query(sql)).rejects.toThrow(/immutable|append-only/);
        await query('ROLLBACK TO SAVEPOINT immutable_check');
        await query('RELEASE SAVEPOINT immutable_check');
      }
      expect((await service.calculations(scope, p.policy_id))[0].sha256).toBe(
        record.sha256,
      );
    });
    it('checks employee object scope again on retries and historical record reads', async () => {
      const p = await published();
      const key = randomUUID();
      await service.saveCalculation(
        scope,
        p.policy_id,
        p.revision,
        { employee_user_id: employee, inputs: inputs() },
        key,
      );
      await query(
        `INSERT INTO hr_access_controls VALUES ($1,$2,'DIRECTORY',true,true,ARRAY[99],ARRAY[7])`,
        [tenant, actor],
      );
      expect(await service.calculations(scope, p.policy_id)).toEqual([]);
      await expect(
        service.saveCalculation(
          scope,
          p.policy_id,
          p.revision,
          { employee_user_id: employee, inputs: inputs() },
          key,
        ),
      ).rejects.toThrow('authorized organization');
      await query('DELETE FROM hr_access_controls');
    });
    it('uses the stored policy when a client attempts to supply a different sheet', async () => {
      const p = await published();
      const result = await service.preview(scope, {
        policy_id: p.policy_id,
        sheet: { categories: [] },
        inputs: inputs(),
      });
      expect(result.calculation.total).toBe(0);
      expect(result.calculation.complete).toBe(true);
    });
  },
);
