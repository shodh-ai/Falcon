import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { DataSource } from 'typeorm';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { QuestionPaperWorkflowService } from './question-paper-workflow.service';

const integration =
  process.env.FALCON_TEST_DB === '1' ? describe : describe.skip;
integration(
  'isolated PostgreSQL question-paper workflow with real disk storage',
  () => {
    jest.setTimeout(30000);
    const sources: DataSource[] = [];
    const fixtures: Array<{
      tenant: string;
      actor: string;
      schedule: string;
      subject: number;
    }> = [];
    const run = randomUUID();
    let db: DataSource, peer: DataSource, observer: DataSource;
    let storage: ObjectStorageService,
      audit: ExamCellAuditService,
      service: QuestionPaperWorkflowService;
    let root: string, originalRoot: string | undefined, roleId: number;
    let pdf: Buffer;

    beforeAll(async () => {
      const url = new URL(process.env.TEST_DATABASE_URL || 'http://invalid');
      if (
        process.env.FALCON_RESET_DB === '1' ||
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        url.hostname !== '127.0.0.1' ||
        url.port !== '55432' ||
        url.pathname !== '/falcon_examcell_test' ||
        url.search ||
        url.hash
      )
        throw new Error('Refusing non-isolated database');
      async function connect(name: string) {
        const source = new DataSource({
          type: 'postgres',
          url: url.toString(),
          synchronize: false,
          migrationsRun: false,
          extra: {
            max: 3,
            application_name: `qp-it-${run}-${name}`,
            statement_timeout: 15000,
          },
        });
        sources.push(source);
        await source.initialize();
        return source;
      }
      observer = await connect('observer');
      const [identity] = await observer.query<
        Array<{ name: string; marker: string }>
      >(
        "SELECT current_database() AS name,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
      );
      if (
        identity.name !== 'falcon_examcell_test' ||
        identity.marker !== 'falcon-examcell-disposable-integration-20261021'
      )
        throw new Error('Disposable database marker required');
      db = await connect('primary');
      peer = await connect('peer');
      const migration = readFileSync(
        resolve(
          __dirname,
          '../../../migrations/20261024120000_question_paper_versions.sql',
        ),
        'utf8',
      );
      await db.transaction((m) => m.query(migration));
      await db.transaction((m) => m.query(migration)); // Existing legacy rows survive an idempotent rerun.
      const [role] = await db.query<Array<{ role_id: number }>>(
        "SELECT role_id FROM roles WHERE role_name='ExamCell'",
      );
      roleId = role.role_id;
      root = mkdtempSync(join(tmpdir(), 'falcon-qp-it-'));
      originalRoot = process.env.UPLOAD_PATH;
      process.env.UPLOAD_PATH = root;
      storage = new ObjectStorageService(
        new ConfigService({ S3_ENDPOINT: '' }),
      );
      audit = new ExamCellAuditService(db);
      service = new QuestionPaperWorkflowService(db, storage, audit);
      const document = await PDFDocument.create();
      document.addPage();
      pdf = Buffer.from(await document.save());
    });

    afterAll(async () => {
      jest.restoreAllMocks();
      try {
        if (db?.isInitialized)
          for (const f of fixtures.reverse())
            await db.transaction(async (m) => {
              for (const table of [
                'exam_audit_logs',
                'exam_question_paper_versions',
                'exam_question_papers',
                'exam_schedules',
                'users',
              ])
                await m.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [
                  f.tenant,
                ]);
              await m.query(
                'DELETE FROM academic_subjects WHERE subject_id=$1',
                [f.subject],
              );
              await m.query('DELETE FROM tenants WHERE tenant_id=$1', [
                f.tenant,
              ]);
            });
      } finally {
        if (originalRoot === undefined) delete process.env.UPLOAD_PATH;
        else process.env.UPLOAD_PATH = originalRoot;
        if (
          (root &&
            resolve(root).startsWith(resolve(tmpdir()) + '\\falcon-qp-it-')) ||
          (root &&
            resolve(root).startsWith(resolve(tmpdir()) + '/falcon-qp-it-'))
        )
          rmSync(root, { recursive: true, force: true });
        for (const source of sources.reverse())
          if (source.isInitialized) await source.destroy();
      }
    });
    afterEach(() => jest.restoreAllMocks());

    async function fixture() {
      const f = {
        tenant: randomUUID(),
        actor: randomUUID(),
        schedule: randomUUID(),
        subject: 0,
      };
      fixtures.push(f);
      await db.query(
        "INSERT INTO tenants(tenant_id,name,subdomain,pg_schema) VALUES($1,'Disposable question-paper QA',$2,'public')",
        [f.tenant, `qp-${f.tenant}`],
      );
      await db.query(
        "INSERT INTO users(user_id,tenant_id,name,official_email,role_id,is_active) VALUES($1,$2,'Disposable paper manager',$3,$4,true)",
        [f.actor, f.tenant, `${f.actor}@example.invalid`, roleId],
      );
      const [subject] = await db.query<Array<{ subject_id: number }>>(
        "INSERT INTO academic_subjects(subject_code,subject_name,program_id,semester,is_active) VALUES($1,'Disposable paper subject',1,4,true) RETURNING subject_id",
        [`QP-${f.tenant.slice(0, 22)}`],
      );
      f.subject = subject.subject_id;
      await db.query(
        "INSERT INTO exam_schedules(exam_schedule_id,tenant_id,subject_id,exam_type,exam_date,start_time,end_time,venue,status) VALUES($1,$2,$3,'END_TERM',CURRENT_DATE,'09:00','12:00','Test room','SCHEDULED')",
        [f.schedule, f.tenant, f.subject],
      );
      const paper = await service.create(f.tenant, f.actor, 'ExamCell', {
        exam_schedule_id: f.schedule,
      });
      return { ...f, id: paper.qp_id };
    }
    async function upload(
      f: Awaited<ReturnType<typeof fixture>>,
      body = pdf,
      reason?: string,
    ) {
      return service.upload(
        f.tenant,
        f.id,
        f.actor,
        'ExamCell',
        { buffer: body, mimetype: 'application/pdf' },
        { reason },
      );
    }
    async function advance(
      f: Awaited<ReturnType<typeof fixture>>,
      status: string,
      reason?: string,
    ) {
      return service.updateStatus(f.tenant, f.id, f.actor, 'ExamCell', {
        status,
        reason,
      });
    }
    async function publish(f: Awaited<ReturnType<typeof fixture>>) {
      for (const s of ['UNDER_MODERATION', 'COE_APPROVED', 'PRINT_AUTHORIZED'])
        await advance(f, s);
    }
    async function row(f: Awaited<ReturnType<typeof fixture>>) {
      const [r] = await observer.query<
        Array<{
          status: string;
          storage_path: string | null;
          approved_by: string | null;
          approved_at: string | null;
        }>
      >('SELECT * FROM exam_question_papers WHERE qp_id=$1', [f.id]);
      return r;
    }
    async function count(
      f: Awaited<ReturnType<typeof fixture>>,
      table: string,
    ) {
      const [r] = await observer.query<Array<{ n: number }>>(
        `SELECT count(*)::int AS n FROM ${table} WHERE tenant_id=$1`,
        [f.tenant],
      );
      return r.n;
    }

    it('requires an actual file, serial legal stages and final authorization before releasing exact stored bytes', async () => {
      const f = await fixture();
      await expect(advance(f, 'UNDER_MODERATION')).rejects.toThrow(
        'verified current PDF',
      );
      await expect(advance(f, 'COE_APPROVED')).rejects.toThrow('Cannot move');
      const v = await upload(f);
      await expect(
        service.download(f.tenant, f.id, f.actor, 'ExamCell'),
      ).rejects.toThrow('not been authorized');
      expect(
        (
          await service.download(
            f.tenant,
            f.id,
            f.actor,
            'ExamCell',
            v.version_id,
          )
        ).buffer.equals(pdf),
      ).toBe(true);
      await publish(f);
      expect(
        (
          await service.download(f.tenant, f.id, f.actor, 'ExamCell')
        ).buffer.equals(pdf),
      ).toBe(true);
      await expect(advance(f, 'PRINT_AUTHORIZED')).rejects.toThrow(
        'Cannot move',
      );
      await expect(upload(f)).rejects.toThrow('cannot be replaced');
      expect(
        (
          await observer.query<Array<{ n: number }>>(
            "SELECT count(*)::int AS n FROM exam_audit_logs WHERE tenant_id=$1 AND action='QP_PRINT_AUTHORIZED'",
            [f.tenant],
          )
        )[0].n,
      ).toBe(1);
    });

    it('retains old versions, requires correction reasons and invalidates approvals on rejection', async () => {
      const f = await fixture();
      const first = await upload(f);
      await advance(f, 'UNDER_MODERATION');
      await advance(f, 'COE_APPROVED');
      await expect(advance(f, 'REJECTED')).rejects.toThrow('reason');
      await advance(f, 'REJECTED', 'Correct question two');
      expect((await row(f)).approved_by).toBeNull();
      await expect(upload(f, pdf)).rejects.toThrow('Explain why');
      const second = await upload(f, pdf, 'Corrected question two');
      expect(second.version_number).toBe(2);
      await expect(advance(f, 'COE_APPROVED')).rejects.toThrow('Cannot move');
      await publish(f);
      expect(
        (await service.versions(f.tenant, f.id, f.actor, 'ExamCell')).length,
      ).toBe(2);
      expect(
        (
          await service.download(
            f.tenant,
            f.id,
            f.actor,
            'ExamCell',
            first.version_id,
          )
        ).buffer.equals(pdf),
      ).toBe(true);
    });

    it('makes identical upload retries idempotent and never returns storage paths', async () => {
      const f = await fixture();
      const a = await upload(f);
      const b = await service.upload(
        f.tenant.toUpperCase(),
        f.id.toUpperCase(),
        f.actor.toUpperCase(),
        'ExamCell',
        { buffer: pdf, mimetype: 'application/pdf' },
        {},
      );
      expect(a.version_id).toBe(b.version_id);
      expect(await count(f, 'exam_question_paper_versions')).toBe(1);
      const [p] = await service.list(f.tenant);
      expect(p.has_file).toBe(true);
      expect(p.storage_path).toBeUndefined();
      expect(
        (await service.versions(f.tenant, f.id, f.actor, 'ExamCell'))[0],
      ).not.toHaveProperty('storage_key');
    });

    it.each(['ExamAdmin', 'ExamOperator', 'DeputyCOE', 'Student'])(
      'denies %s service calls before storage or changes',
      async (role) => {
        const f = await fixture();
        const spy = jest.spyOn(storage, 'getDownloadStream');
        await expect(
          service.updateStatus(f.tenant, f.id, f.actor, role, {
            status: 'COE_APPROVED',
          }),
        ).rejects.toThrow('permission');
        await expect(
          service.download(f.tenant, f.id, f.actor, role),
        ).rejects.toThrow('permission');
        expect(spy).not.toHaveBeenCalled();
      },
    );

    it('rejects cross-tenant records, mismatched subjects and invalid tenant context', async () => {
      const f = await fixture(),
        other = await fixture();
      await upload(f);
      await expect(
        service.create(f.tenant, f.actor, 'ExamCell', {
          exam_schedule_id: other.schedule,
        }),
      ).rejects.toThrow('not found');
      await expect(
        service.create(f.tenant, f.actor, 'ExamCell', {
          exam_schedule_id: f.schedule,
          subject_id: other.subject,
        }),
      ).rejects.toThrow('Subject must match');
      await expect(
        service.versions(other.tenant, f.id, other.actor, 'ExamCell'),
      ).rejects.toThrow('not found');
      await expect(
        service.download(other.tenant, f.id, other.actor, 'ExamCell'),
      ).rejects.toThrow('not found');
      await expect(service.list(' ')).rejects.toThrow('tenant');
      await expect(
        service.versions(f.tenant, f.id, other.actor, 'ExamCell'),
      ).rejects.toThrow('actor required');
    });

    it('rejects invalid PDF bytes and storage failure without registering a file', async () => {
      const f = await fixture();
      await expect(upload(f, Buffer.from('not a PDF'))).rejects.toThrow(
        'valid, unencrypted PDF',
      );
      jest
        .spyOn(storage, 'upload')
        .mockRejectedValueOnce(new Error('Storage offline'));
      await expect(upload(f)).rejects.toThrow('storage is unavailable');
      expect(await count(f, 'exam_question_paper_versions')).toBe(0);
      expect((await row(f)).storage_path).toBeNull();
    });

    it('required SQL audit failure rolls back the version and metadata despite a written disk object', async () => {
      const f = await fixture();
      const realLog = audit.log.bind(audit) as ExamCellAuditService['log'];
      jest
        .spyOn(audit, 'log')
        .mockImplementation(async (t, a, payload, manager) => {
          if (payload.action === 'QP_UPLOADED')
            await manager!.query('SELECT 1/0');
          return realLog(t, a, payload, manager);
        });
      await expect(upload(f)).rejects.toThrow();
      expect(await count(f, 'exam_question_paper_versions')).toBe(0);
      expect((await row(f)).storage_path).toBeNull();
      await expect(
        service.download(f.tenant, f.id, f.actor, 'ExamCell'),
      ).rejects.toThrow('not been authorized');
    });

    it('rolls back approval on a required audit SQL failure', async () => {
      const f = await fixture();
      await upload(f);
      await advance(f, 'UNDER_MODERATION');
      jest.spyOn(audit, 'log').mockImplementation(async (_t, _a, _p, m) => {
        await m!.query('SELECT 1/0');
      });
      await expect(advance(f, 'COE_APPROVED')).rejects.toThrow();
      expect((await row(f)).status).toBe('UNDER_MODERATION');
      expect((await row(f)).approved_by).toBeNull();
    });

    it('allows only one of two concurrent attempts to advance the same stage', async () => {
      const f = await fixture();
      await upload(f);
      const competing = new QuestionPaperWorkflowService(
        peer,
        storage,
        new ExamCellAuditService(peer),
      );
      const outcomes = await Promise.allSettled([
        advance(f, 'UNDER_MODERATION'),
        competing.updateStatus(f.tenant, f.id, f.actor, 'ExamCell', {
          status: 'UNDER_MODERATION',
        }),
      ]);
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(1);
      expect((await row(f)).status).toBe('UNDER_MODERATION');
    });

    it('real PostgreSQL row locks prevent replacement racing with moderation', async () => {
      const f = await fixture();
      await upload(f);
      let entered!: () => void, release!: () => void;
      const enteredPromise = new Promise<void>((r) => {
        entered = r;
      });
      const gate = new Promise<void>((r) => {
        release = r;
      });
      const realLog = audit.log.bind(audit) as ExamCellAuditService['log'];
      jest.spyOn(audit, 'log').mockImplementation(async (t, a, p, m) => {
        if (p.action === 'QP_UNDER_MODERATION') {
          entered();
          await gate;
        }
        return realLog(t, a, p, m);
      });
      const first = advance(f, 'UNDER_MODERATION');
      await Promise.race([
        enteredPromise,
        first.then(() => {
          throw new Error('Audit barrier was not reached');
        }),
      ]);
      const competing = new QuestionPaperWorkflowService(
        peer,
        storage,
        new ExamCellAuditService(peer),
      );
      const replacement = competing.upload(
        f.tenant,
        f.id,
        f.actor,
        'ExamCell',
        { buffer: pdf, mimetype: 'application/pdf' },
        { reason: 'Competing replacement' },
      );
      const expectedRejection =
        expect(replacement).rejects.toThrow('cannot be replaced');
      try {
        let blocked = false;
        for (let i = 0; i < 100; i++) {
          const [state] = await observer.query<Array<{ blocked: boolean }>>(
            "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock') AS blocked",
            [`qp-it-${run}-peer`],
          );
          if (state.blocked) {
            blocked = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(blocked).toBe(true);
      } finally {
        release();
      }
      await first;
      await expectedRejection;
      expect(await count(f, 'exam_question_paper_versions')).toBe(1);
    });

    it('rejects legacy approved records and forged paths; tampered stored bytes never download', async () => {
      const f = await fixture();
      await db.query(
        "UPDATE exam_question_papers SET status='PRINT_AUTHORIZED',storage_path='/uploads/unverified.pdf' WHERE qp_id=$1",
        [f.id],
      );
      await expect(
        service.download(f.tenant, f.id, f.actor, 'ExamCell'),
      ).rejects.toThrow('verified current PDF');
      await db.query(
        "UPDATE exam_question_papers SET status='UPLOADED',storage_path=NULL WHERE qp_id=$1",
        [f.id],
      );
      await upload(f);
      await publish(f);
      const path = (await row(f)).storage_path!;
      await db.query(
        'UPDATE exam_question_papers SET storage_path=$2 WHERE qp_id=$1',
        [f.id, `${f.tenant}/../../other.pdf`],
      );
      await expect(
        service.download(f.tenant, f.id, f.actor, 'ExamCell'),
      ).rejects.toThrow('verified current PDF');
      await db.query(
        'UPDATE exam_question_papers SET storage_path=$2 WHERE qp_id=$1',
        [f.id, path],
      );
      writeFileSync(join(root, path), 'tampered');
      await expect(
        service.download(f.tenant, f.id, f.actor, 'ExamCell'),
      ).rejects.toThrow('file is unavailable');
    });

    it('blocks every skip and backward transition, including rejection after printing', async () => {
      const f = await fixture();
      await upload(f);
      await expect(advance(f, 'PRINT_AUTHORIZED')).rejects.toThrow(
        'Cannot move',
      );
      await advance(f, 'UNDER_MODERATION');
      await expect(advance(f, 'PRINT_AUTHORIZED')).rejects.toThrow(
        'Cannot move',
      );
      await advance(f, 'COE_APPROVED');
      await expect(advance(f, 'UNDER_MODERATION')).rejects.toThrow(
        'Cannot move',
      );
      await advance(f, 'PRINT_AUTHORIZED');
      await expect(
        advance(f, 'REJECTED', 'Cannot silently revoke a released paper'),
      ).rejects.toThrow('Cannot move');
    });

    it('serializes duplicate concurrent uploads into one immutable version', async () => {
      const f = await fixture();
      const competing = new QuestionPaperWorkflowService(
        peer,
        storage,
        new ExamCellAuditService(peer),
      );
      const [a, b] = await Promise.all([
        upload(f),
        competing.upload(
          f.tenant,
          f.id,
          f.actor,
          'ExamCell',
          { buffer: pdf, mimetype: 'application/pdf' },
          {},
        ),
      ]);
      expect(a.version_id).toBe(b.version_id);
      expect(await count(f, 'exam_question_paper_versions')).toBe(1);
    });

    it('denies missing files and required download audit failure without claiming release', async () => {
      const f = await fixture();
      await upload(f);
      await publish(f);
      const path = (await row(f)).storage_path!;
      const realLog = audit.log.bind(audit) as ExamCellAuditService['log'];
      jest.spyOn(audit, 'log').mockImplementation(async (t, a, p, m) => {
        if (p.action === 'QP_RELEASED') await m!.query('SELECT 1/0');
        return realLog(t, a, p, m);
      });
      await expect(
        service.download(f.tenant, f.id, f.actor, 'ExamCell'),
      ).rejects.toThrow();
      expect(
        (
          await observer.query<Array<{ n: number }>>(
            "SELECT count(*)::int AS n FROM exam_audit_logs WHERE tenant_id=$1 AND action='QP_RELEASED'",
            [f.tenant],
          )
        )[0].n,
      ).toBe(0);
      jest.restoreAllMocks();
      rmSync(join(root, path));
      await expect(
        service.download(f.tenant, f.id, f.actor, 'ExamCell'),
      ).rejects.toThrow('file is unavailable');
      expect((await row(f)).status).toBe('PRINT_AUTHORIZED');
    });
  },
);
