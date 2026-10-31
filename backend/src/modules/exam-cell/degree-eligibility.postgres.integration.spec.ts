import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EnterpriseAuditService } from '../../core/audit/enterprise-audit.service';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';
import { RegistrarService } from '../registrar/registrar.service';

// These tests use only the marked disposable localhost PostgreSQL target. They
// deliberately keep requirements_policy_status unconfirmed; they do not fake
// university policy to demonstrate a successful degree approval or issuance.
const integration =
  process.env.FALCON_TEST_DB === '1' ? describe : describe.skip;
const marker = 'falcon-examcell-disposable-integration-20261021';

function tableDdl(file: string, table: string) {
  const sql = readFileSync(
    resolve(__dirname, '../../../migrations', file),
    'utf8',
  );
  const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  const end = sql.indexOf('\n);', start);
  if (start < 0 || end < 0) throw new Error(`Existing ${table} DDL not found`);
  return sql.slice(start, end + 3);
}

integration(
  'isolated PostgreSQL degree eligibility and Registrar controls',
  () => {
    jest.setTimeout(30000);
    const tenantId = randomUUID();
    const otherTenantId = randomUUID();
    const studentId = randomUUID();
    const actorId = randomUUID();
    const courseId = randomUUID();
    const sources: DataSource[] = [];
    let db: DataSource;
    let examCell: ExamCellEnterpriseService;
    let registrar: RegistrarService;
    let degreeRequestId: string;
    let historyFailureTrigger = false;

    beforeAll(async () => {
      if (process.env.FALCON_RESET_DB === '1')
        throw new Error('Refusing reset-enabled test environment');
      const supplied = process.env.TEST_DATABASE_URL;
      if (!supplied) throw new Error('Explicit TEST_DATABASE_URL required');
      const target = new URL(supplied);
      if (
        !['postgres:', 'postgresql:'].includes(target.protocol) ||
        target.hostname !== '127.0.0.1' ||
        target.port !== '55432' ||
        target.pathname !== '/falcon_examcell_test' ||
        target.search ||
        target.hash
      ) {
        throw new Error('Refusing non-isolated degree eligibility database');
      }
      db = new DataSource({
        type: 'postgres',
        url: target.toString(),
        entities: [],
        synchronize: false,
        migrationsRun: false,
        extra: {
          application_name: `degree-eligibility-${randomUUID()}`,
          statement_timeout: 15000,
        },
      });
      sources.push(db);
      await db.initialize();
      const [identity] = await db.query(
        "SELECT current_database() AS name, shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
      );
      if (
        identity.name !== 'falcon_examcell_test' ||
        identity.marker !== marker
      ) {
        throw new Error('Disposable PostgreSQL marker required before writes');
      }

      // Provision only existing table definitions needed by these tests. No full
      // migration runner, schema sync, application URL, or shared database use.
      await db.transaction(async (manager) => {
        for (const [file, table] of [
          ['20260530144500_campus_os_gap_modules.sql', 'grade_cards'],
          [
            '20260530170000_master_requirements_campus_os_schema.sql',
            'student_backlog_history',
          ],
          ['20260603130000_falcon_library_lms.sql', 'lib_catalog'],
          ['20260603130000_falcon_library_lms.sql', 'lib_inventory_copies'],
          ['20260603130000_falcon_library_lms.sql', 'lib_circulation'],
          [
            '20260732120000_exam_cell_enterprise_enhancements.sql',
            'degree_eligibility_audits',
          ],
          [
            '20260804120000_registrar_enterprise_desk.sql',
            'registrar_certificate_requests',
          ],
          [
            '20260611120000_executive_financial_intelligence.sql',
            'system_audit_logs',
          ],
        ] as const) {
          await manager.query(tableDdl(file, table));
        }
        const registrarProduction = readFileSync(
          resolve(
            __dirname,
            '../../../migrations/20260805140000_registrar_production_complete.sql',
          ),
          'utf8',
        );
        const verificationColumn = registrarProduction.match(
          /ALTER TABLE registrar_certificate_requests\s+ADD COLUMN IF NOT EXISTS verification_code VARCHAR\(32\);/,
        );
        const verificationIndex = registrarProduction.match(
          /CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_cert_verification_code[\s\S]*?;/,
        );
        if (!verificationColumn || !verificationIndex) {
          throw new Error(
            'Existing Registrar verification-code schema could not be located',
          );
        }
        await manager.query(verificationColumn[0]);
        await manager.query(verificationIndex[0]);
        const registrarSql = readFileSync(
          resolve(
            __dirname,
            '../../../migrations/20260804190000_registrar_critical_core_fixes.sql',
          ),
          'utf8',
        ).split('-- ── Enrollment uniqueness')[0];
        for (const statement of registrarSql
          .split(';')
          .map((part) => part.trim())
          .filter(
            (part) =>
              part.includes('ALTER TABLE degree_eligibility_audits') ||
              part.includes(
                'CREATE TABLE IF NOT EXISTS registrar_degree_approval_history',
              ),
          )
          .map((part) => `${part};`)) {
          await manager.query(statement);
        }
        const migration = readFileSync(
          resolve(
            __dirname,
            '../../../migrations/20261029120000_degree_eligibility_clearance_status.sql',
          ),
          'utf8',
        );
        await manager.query(migration);
      });

      await db.query(
        `INSERT INTO tenants (tenant_id, name, subdomain, pg_schema) VALUES
       ($1, 'Degree Eligibility Test', $2, $3),
       ($4, 'Other Degree Test', $5, $6)`,
        [
          tenantId,
          `degree-${tenantId.slice(0, 8)}`,
          `degree_${tenantId.slice(0, 8)}`,
          otherTenantId,
          `other-${otherTenantId.slice(0, 8)}`,
          `other_${otherTenantId.slice(0, 8)}`,
        ],
      );
      await db.query(
        `INSERT INTO users (user_id, tenant_id, name, official_email) VALUES
       ($1, $2, 'Degree Test Student', $3), ($4, $2, 'Degree Test Registrar', $5)`,
        [
          studentId,
          tenantId,
          `${studentId}@degree-test.invalid`,
          actorId,
          `${actorId}@degree-test.invalid`,
        ],
      );
      await db.query(
        `INSERT INTO academic_courses (course_id, tenant_id, course_code, course_name, credits)
       VALUES ($1,$2,'DEG-TEST-1','Degree test course',3)`,
        [courseId, tenantId],
      );
      await db.query(
        `INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status)
       VALUES ($1,$2,$3,1,'COMPLETED')`,
        [tenantId, studentId, courseId],
      );
      await db.query(
        `INSERT INTO grade_cards (tenant_id, student_user_id, semester, cgpa, status, published_at)
       VALUES ($1,$2,1,9.9,'DRAFT',NULL), ($1,$2,1,7.5,'PUBLISHED',NOW())`,
        [tenantId, studentId],
      );

      examCell = new ExamCellEnterpriseService(
        db,
        {} as never,
        {
          getPendingDues: async () => [
            { fee_head: 'UNCLASSIFIED_DUE', status: 'PENDING' },
          ],
        } as never,
        {} as never,
      );
      registrar = new RegistrarService(
        db,
        {} as never,
        {} as never,
        new EnterpriseAuditService(db),
      );
    });

    afterAll(async () => {
      try {
        if (db?.isInitialized) {
          if (historyFailureTrigger) {
            await db.query(
              'DROP TRIGGER IF EXISTS degree_test_history_failure ON registrar_degree_approval_history',
            );
            await db.query(
              'DROP FUNCTION IF EXISTS degree_test_history_failure()',
            );
          }
          await db.transaction(async (manager) => {
            await manager.query(
              `DELETE FROM system_audit_logs
             WHERE old_value->'_meta'->>'tenant_id' = $1 OR new_value->'_meta'->>'tenant_id' = $1`,
              [tenantId],
            );
            const [auditLogExists] = await manager.query(
              "SELECT to_regclass('public.audit_log') IS NOT NULL AS present",
            );
            if (auditLogExists.present) {
              await manager.query(
                'DELETE FROM audit_log WHERE user_id = ANY($1::uuid[])',
                [[studentId, actorId]],
              );
            }
            for (const table of [
              'registrar_certificate_requests',
              'registrar_degree_approval_history',
              'degree_eligibility_audits',
              'student_backlog_history',
              'grade_cards',
              'lib_circulation',
              'student_course_enrollments',
              'academic_courses',
            ]) {
              await manager.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [
                tenantId,
              ]);
            }
            await manager.query('DELETE FROM users WHERE tenant_id=$1', [
              tenantId,
            ]);
            await manager.query(
              'DELETE FROM tenants WHERE tenant_id = ANY($1::uuid[])',
              [[tenantId, otherTenantId]],
            );
          });
        }
      } finally {
        for (const source of sources.reverse())
          if (source.isInitialized) await source.destroy();
      }
    });

    it('persists a tenant-scoped audit using published CGPA and leaves unconfirmed requirements unavailable', async () => {
      const result = await examCell.runDegreeEligibilityAudit(
        tenantId,
        studentId,
        actorId,
      );
      expect(Number(result.credits_earned)).toBe(3);
      expect(Number(result.cgpa_earned)).toBe(7.5);
      expect(result.requirements_policy_status).toBe('UNCONFIRMED');
      expect(result.clearance_statuses).toMatchObject({
        credits: 'UNAVAILABLE',
        cgpa: 'UNAVAILABLE',
        finance: 'UNAVAILABLE',
        hostel: 'UNAVAILABLE',
        backlogs: 'CLEARED',
        library: 'CLEARED',
      });
      expect(result.final_status).toBe('PENDING');
      const [persisted] = await db.query(
        'SELECT * FROM degree_eligibility_audits WHERE tenant_id=$1 AND student_user_id=$2 ORDER BY checked_at DESC LIMIT 1',
        [tenantId, studentId],
      );
      expect(persisted).toBeTruthy();
    });

    it('persists UNAVAILABLE after an optional source SQL error without poisoning the transaction', async () => {
      await db.query(
        'ALTER TABLE lib_circulation RENAME TO degree_test_hidden_library',
      );
      try {
        const result = await examCell.runDegreeEligibilityAudit(
          tenantId,
          studentId,
          actorId,
        );
        expect(result.clearance_statuses.library).toBe('UNAVAILABLE');
        expect(result.final_status).toBe('PENDING');
        const [persisted] = await db.query(
          'SELECT clearance_statuses FROM degree_eligibility_audits WHERE tenant_id=$1 AND student_user_id=$2 ORDER BY checked_at DESC LIMIT 1',
          [tenantId, studentId],
        );
        expect(persisted.clearance_statuses.library).toBe('UNAVAILABLE');
      } finally {
        await db.query(
          'ALTER TABLE degree_test_hidden_library RENAME TO lib_circulation',
        );
      }
    });

    it('deduplicates repeated backlog attempts and blocks unresolved course backlogs', async () => {
      await db.query(
        `INSERT INTO student_backlog_history
         (tenant_id, student_user_id, course_id, academic_year, semester, attempt_no, status)
       VALUES ($1,$2,$3,'2025-26',1,1,'ACTIVE'), ($1,$2,$3,'2025-26',1,2,'FAILED_AGAIN')`,
        [tenantId, studentId, courseId],
      );
      const result = await examCell.runDegreeEligibilityAudit(
        tenantId,
        studentId,
        actorId,
      );
      expect(result.pending_backlogs).toBe(1);
      expect(result.clearance_statuses.backlogs).toBe('NOT_CLEARED');
      expect(result.final_status).toBe('NOT_ELIGIBLE');
    });

    it('rejects a student from another tenant before persisting an audit', async () => {
      await expect(
        examCell.runDegreeEligibilityAudit(otherTenantId, studentId, actorId),
      ).rejects.toBeInstanceOf(NotFoundException);
      const [count] = await db.query(
        'SELECT COUNT(*)::int AS count FROM degree_eligibility_audits WHERE tenant_id=$1',
        [otherTenantId],
      );
      expect(count.count).toBe(0);
    });

    it('does not report success when the audit insert fails its actor foreign key', async () => {
      const [before] = await db.query(
        'SELECT COUNT(*)::int AS count FROM degree_eligibility_audits WHERE tenant_id=$1 AND student_user_id=$2',
        [tenantId, studentId],
      );
      await expect(
        examCell.runDegreeEligibilityAudit(tenantId, studentId, randomUUID()),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      const [after] = await db.query(
        'SELECT COUNT(*)::int AS count FROM degree_eligibility_audits WHERE tenant_id=$1 AND student_user_id=$2',
        [tenantId, studentId],
      );
      expect(after.count).toBe(before.count);
    });

    it('blocks Registrar approval for unconfirmed policy and stale persisted audits', async () => {
      await examCell.runDegreeEligibilityAudit(tenantId, studentId, actorId);
      const [current] = await db.query(
        'SELECT audit_id FROM degree_eligibility_audits WHERE tenant_id=$1 AND student_user_id=$2 ORDER BY checked_at DESC LIMIT 1',
        [tenantId, studentId],
      );
      await expect(
        registrar.decideDegreeEligibility(
          tenantId,
          actorId,
          current.audit_id,
          'APPROVED',
          'Reviewed',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await examCell.runDegreeEligibilityAudit(tenantId, studentId, actorId);
      const [newer] = await db.query(
        'SELECT audit_id FROM degree_eligibility_audits WHERE tenant_id=$1 AND student_user_id=$2 ORDER BY checked_at DESC LIMIT 1',
        [tenantId, studentId],
      );
      await expect(
        registrar.decideDegreeEligibility(
          tenantId,
          actorId,
          current.audit_id,
          'REJECTED',
          'Stale review',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(newer.audit_id).not.toBe(current.audit_id);
    });

    it('rolls back a Registrar decision when the required approval-history write fails', async () => {
      const [audit] = await db.query(
        `SELECT audit_id FROM degree_eligibility_audits
       WHERE tenant_id=$1 AND student_user_id=$2 ORDER BY checked_at DESC LIMIT 1`,
        [tenantId, studentId],
      );
      await db.query(`
      CREATE OR REPLACE FUNCTION degree_test_history_failure() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected degree history failure'; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER degree_test_history_failure
      BEFORE INSERT ON registrar_degree_approval_history
      FOR EACH ROW EXECUTE FUNCTION degree_test_history_failure();
    `);
      historyFailureTrigger = true;
      await expect(
        registrar.decideDegreeEligibility(
          tenantId,
          actorId,
          audit.audit_id,
          'REJECTED',
          'Failure test',
        ),
      ).rejects.toThrow('injected degree history failure');
      const [after] = await db.query(
        'SELECT registrar_decision FROM degree_eligibility_audits WHERE tenant_id=$1 AND audit_id=$2',
        [tenantId, audit.audit_id],
      );
      expect(after.registrar_decision).toBe('PENDING');
    });

    it('does not issue a signed degree request while eligibility policy is unconfirmed', async () => {
      degreeRequestId = randomUUID();
      await db.query(
        `INSERT INTO registrar_certificate_requests
         (request_id, tenant_id, student_user_id, certificate_type, status)
       VALUES ($1,$2,$3,'DEGREE','SIGNED')`,
        [degreeRequestId, tenantId, studentId],
      );
      await expect(
        registrar.transitionCertificate(
          tenantId,
          actorId,
          degreeRequestId,
          'ISSUE',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      const [request] = await db.query(
        'SELECT status FROM registrar_certificate_requests WHERE tenant_id=$1 AND request_id=$2',
        [tenantId, degreeRequestId],
      );
      expect(request.status).toBe('SIGNED');
    });

    it('makes simultaneous retries of an already issued request read-only', async () => {
      const issuedRequestId = randomUUID();
      await db.query(
        `INSERT INTO registrar_certificate_requests
         (request_id, tenant_id, student_user_id, certificate_type, status, issued_at, issued_by, verification_code)
       VALUES ($1,$2,$3,'DEGREE','ISSUED',NOW(),$4,'DEGREE-TEST-CODE')`,
        [issuedRequestId, tenantId, studentId, actorId],
      );
      const [first, second] = await Promise.all([
        registrar.transitionCertificate(
          tenantId,
          actorId,
          issuedRequestId,
          'ISSUE',
        ),
        registrar.transitionCertificate(
          tenantId,
          actorId,
          issuedRequestId,
          'ISSUE',
        ),
      ]);
      expect(first.verification_code).toBe('DEGREE-TEST-CODE');
      expect(second.verification_code).toBe('DEGREE-TEST-CODE');
      const [count] = await db.query(
        `SELECT COUNT(*)::int AS count FROM registrar_certificate_requests
       WHERE tenant_id=$1 AND request_id=$2 AND status='ISSUED'`,
        [tenantId, issuedRequestId],
      );
      expect(count.count).toBe(1);
    });
  },
);
