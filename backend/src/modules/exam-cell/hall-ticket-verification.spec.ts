import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { AdmitCardPdfService } from '../exams/pdf/admit-card-pdf.service';
import { HallTicketVerificationService } from './hall-ticket-verification.service';

const tenant = '11111111-1111-4111-8111-111111111111';
const student = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333';
const otherTenant = '44444444-4444-4444-8444-444444444444';
const firstId = '55555555-5555-4555-8555-555555555555';
const lastId = '66666666-6666-4666-8666-666666666666';
const issueId = '77777777-7777-4777-8777-777777777777';
type Issue = {
  issue_id: string;
  student_user_id: string;
  schedule_ids: string[];
  revision_hash: string;
  revoked_at: Date | null;
  tenant_id: string;
  token_hash: string;
  issued_by: string;
};

function database() {
  const current = {
    eligible: true,
    student: {
      user_id: student,
      name: 'Synthetic student',
      enrollment_no: 'SYNTHETIC',
      current_semester: 4,
    },
    schedules: [
      {
        exam_schedule_id: firstId,
        exam_date: '2026-10-21',
        start_time: '09:00:00',
        end_time: '12:00:00',
        subject_code: 'SYNTH101',
        allocated_room: 'SYNTH-A',
        seat_number: 'A1',
        approval_stage: 'APPROVED',
      },
      {
        exam_schedule_id: lastId,
        exam_date: '2026-10-23',
        start_time: '09:00:00',
        end_time: '12:00:00',
        subject_code: 'SYNTH102',
        allocated_room: 'SYNTH-B',
        seat_number: 'B1',
        approval_stage: 'APPROVED',
      },
    ],
    issues: [] as Issue[],
  };
  const query = jest.fn((sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM users u JOIN roles'))
      return Promise.resolve(current.eligible ? [{ ...current.student }] : []);
    if (sql.includes('FROM exam_schedules es'))
      return Promise.resolve(
        current.schedules
          .filter((row) =>
            (params[2] as string[]).includes(row.exam_schedule_id),
          )
          .map((row) => ({ ...row })),
      );
    if (sql.startsWith('INSERT INTO exam_hall_ticket_issues')) {
      current.issues.push({
        issue_id: issueId,
        tenant_id: params[0] as string,
        student_user_id: params[1] as string,
        schedule_ids: params[2] as string[],
        token_hash: params[3] as string,
        revision_hash: params[4] as string,
        issued_by: params[5] as string,
        revoked_at: null,
      });
      return Promise.resolve([{ issue_id: issueId }]);
    }
    if (sql.includes('FROM exam_hall_ticket_issues WHERE tenant_id'))
      return Promise.resolve(
        current.issues.filter(
          (row) => row.tenant_id === params[0] && row.token_hash === params[1],
        ),
      );
    if (sql.includes('WITH changed AS (UPDATE exam_hall_ticket_issues')) {
      const row = current.issues.find(
        (item) =>
          item.tenant_id === params[0] &&
          item.issue_id === params[1] &&
          !item.revoked_at,
      );
      if (!row) return Promise.resolve([]);
      row.revoked_at = new Date();
      return Promise.resolve([{ issue_id: row.issue_id }]);
    }
    return Promise.resolve([]);
  });
  const transaction = jest.fn((run: (tx: { query: typeof query }) => unknown) =>
    run({ query }),
  );
  return {
    current,
    query,
    transaction,
    service: new HallTicketVerificationService({ query, transaction } as never),
  };
}

describe('Secure hall-ticket record verification', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-21T04:00:00Z'));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('stores only token hashes, the actual issuer and the exact approved schedule snapshot', async () => {
    const fixture = database();
    const result = await fixture.service.issue(
      tenant,
      student,
      [lastId, firstId, firstId],
      undefined,
      actor,
    );
    expect(result.payload).toMatch(/^FALCON-HALL-TICKET:[A-Za-z0-9_-]{43}$/);
    expect(fixture.current.issues[0]).toMatchObject({
      schedule_ids: [firstId, lastId],
      issued_by: actor,
    });
    expect(fixture.current.issues[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(fixture.current.issues[0].token_hash).not.toContain(
      result.payload.slice('FALCON-HALL-TICKET:'.length),
    );
    const audit = fixture.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO exam_audit_logs'),
    );
    expect(audit?.[1]?.[1]).toBe(actor);
    expect(audit?.[1]?.[2]).toBe('HALL_TICKET_ISSUED');
    await expect(
      fixture.service.verify(tenant, result.payload),
    ).resolves.toMatchObject({ verified: true, student_user_id: student });
  });

  it('keeps a multi-day ticket valid after the first paper ends and expires after the last paper in IST', async () => {
    const fixture = database();
    const result = await fixture.service.issue(tenant, student, [
      firstId,
      lastId,
    ]);
    jest.setSystemTime(new Date('2026-10-21T07:00:00Z'));
    await expect(
      fixture.service.verify(tenant, result.payload),
    ).resolves.toMatchObject({ verified: true });
    const schedulesSql = fixture.query.mock.calls.find(([sql]) =>
      sql.includes('FROM exam_schedules es'),
    )?.[0];
    expect(schedulesSql).toContain("es.status IN ('SCHEDULED','COMPLETED')");
    expect(schedulesSql).not.toContain("AT TIME ZONE 'Asia/Kolkata' >= NOW()");
    jest.setSystemTime(new Date('2026-10-23T06:30:01Z'));
    await expect(
      fixture.service.verify(tenant, result.payload),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not accept a modified token, a different tenant or an identity identifier as a verified hall ticket', async () => {
    const fixture = database();
    const result = await fixture.service.issue(tenant, student, [firstId]);
    const changed =
      result.payload.slice(0, -1) + (result.payload.endsWith('A') ? 'B' : 'A');
    for (const [scope, payload] of [
      [tenant, changed],
      [otherTenant, result.payload],
      [tenant, `student:${student}`],
    ]) {
      await expect(
        fixture.service.verify(scope, payload),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('rejects changed student details, seating and missing enrollment/approval records', async () => {
    for (const change of ['name', 'seat', 'missing']) {
      const fixture = database();
      const result = await fixture.service.issue(tenant, student, [
        firstId,
        lastId,
      ]);
      if (change === 'name') fixture.current.student.name = 'Changed student';
      if (change === 'seat') fixture.current.schedules[0].seat_number = 'A9';
      if (change === 'missing') fixture.current.schedules.pop();
      await expect(
        fixture.service.verify(tenant, result.payload),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('rechecks active student, UFM, finance dues and hostel-fine restrictions', async () => {
    const fixture = database();
    const result = await fixture.service.issue(tenant, student, [
      firstId,
      lastId,
    ]);
    fixture.current.eligible = false;
    await expect(
      fixture.service.verify(tenant, result.payload),
    ).rejects.toBeInstanceOf(NotFoundException);
    const sql = fixture.query.mock.calls.find(([text]) =>
      text.includes('FROM users u JOIN roles'),
    )?.[0];
    expect(sql).toContain('u.is_active = true');
    expect(sql).toContain('ufm_cases');
    expect(sql).toContain('finance_fee_demands');
    expect(sql).toContain('operations_hostel_fines');
  });

  it('makes an explicit revocation invalidate the printed token and audits the real actor', async () => {
    const fixture = database();
    const result = await fixture.service.issue(tenant, student, [
      firstId,
      lastId,
    ]);
    await fixture.service.revoke(tenant, issueId, actor, 'Corrected schedule');
    await expect(
      fixture.service.verify(tenant, result.payload),
    ).rejects.toBeInstanceOf(NotFoundException);
    const audit = fixture.query.mock.calls.find(
      ([sql, params]) =>
        sql.includes('INSERT INTO exam_audit_logs') &&
        params?.[2] === 'HALL_TICKET_REVOKED',
    );
    expect(audit?.[1]?.[1]).toBe(actor);
  });

  it('uses an existing issuance transaction for snapshot, token persistence and audit', async () => {
    const fixture = database();
    const global = jest
      .fn()
      .mockRejectedValue(new Error('Unexpected connection'));
    const service = new HallTicketVerificationService({
      query: global,
    } as never);
    await service.issue(
      tenant,
      student,
      [firstId, lastId],
      { query: fixture.query } as never,
      actor,
    );
    expect(global).not.toHaveBeenCalled();
    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      [`hall-ticket:${tenant}:${student}`],
    );
  });

  it('rejects malformed/empty issuance input before database writes', async () => {
    const fixture = database();
    for (const ids of [[], ['not-a-uuid']])
      await expect(
        fixture.service.issue(tenant, student, ids),
      ).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.query).not.toHaveBeenCalled();
  });

  it('reserves QR quiet space above the footer on short, long and multi-page PDFs', async () => {
    const draw = jest.spyOn(PDFPage.prototype, 'drawRectangle');
    const pdf = new AdmitCardPdfService();
    for (const count of [1, 11, 40]) {
      draw.mockClear();
      const buffer = await pdf.generate({
        student: {
          user_id: student,
          name: 'Synthetic student',
          email: 'synthetic@example.invalid',
        },
        exams: Array.from({ length: count }, () => ({
          exam_date: '2026-10-21',
          start_time: '09:00:00',
          end_time: '12:00:00',
          exam_type: 'END_TERM',
          subject_code: 'SYNTH101',
          subject_name: 'Synthetic course',
          building: 'SYNTH',
          room: 'A1',
        })),
        barcodePayload: `FALCON-HALL-TICKET:${'A'.repeat(43)}`,
      });
      expect(
        (await PDFDocument.load(buffer)).getPageCount(),
      ).toBeGreaterThanOrEqual(1);
      if (count === 40)
        expect((await PDFDocument.load(buffer)).getPageCount()).toBeGreaterThan(
          1,
        );
      const quiet = draw.mock.calls
        .map(([options]) => options)
        .find((options) => options?.width === 90 && options?.height === 90);
      expect(quiet).toBeDefined();
      expect(quiet?.y).toBeGreaterThan(48);
      expect((quiet?.y ?? 0) + 90).toBeLessThan(842);
      const modules = draw.mock.calls
        .map(([options]) => options)
        .filter(
          (options) =>
            (options?.width ?? 0) > 0 &&
            (options?.width ?? 10) < 5 &&
            options?.width === options?.height,
        );
      expect(modules.length).toBeGreaterThan(100);
      const unit = modules[0]?.width ?? 0;
      for (const module of modules) {
        expect(module?.x ?? 0).toBeGreaterThanOrEqual(
          (quiet?.x ?? 0) + unit * 4 - 0.000001,
        );
        expect((module?.x ?? 0) + (module?.width ?? 0)).toBeLessThanOrEqual(
          (quiet?.x ?? 0) + 90 - unit * 4 + 0.000001,
        );
        expect(module?.y ?? 0).toBeGreaterThanOrEqual(
          (quiet?.y ?? 0) + unit * 4 - 0.000001,
        );
      }
    }
  });
});
