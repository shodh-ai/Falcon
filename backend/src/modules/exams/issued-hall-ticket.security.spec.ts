import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  IssuedHallTicketService,
  issuedHallTicketKey,
} from './issued-hall-ticket.service';
import { ExamsService } from './exams.service';

describe('issued hall-ticket retrieval (mocked database/storage)', () => {
  function fixture() {
    const bytes = Buffer.from('%PDF-1.4\nissued document bytes\n%%EOF');
    const date = '2026-10-23T10:00:00.000Z';
    const row = {
      tenant_id: randomUUID(),
      student_user_id: randomUUID(),
      entry_id: randomUUID(),
      session_id: randomUUID(),
      session_name: 'Test examination',
      semester: 4,
      registration_id: randomUUID(),
      window_id: randomUUID(),
      approval_id: randomUUID(),
      approved_at: date,
      reviewed_at: date,
      issued_at: date,
      pdf_path: '',
      document_sha256: createHash('sha256').update(bytes).digest('hex'),
      issuance_snapshot: {} as Record<string, unknown>,
    };
    row.pdf_path = issuedHallTicketKey({
      tenant_id: row.tenant_id,
      student_user_id: row.student_user_id,
      session_id: row.session_id,
      entry_id: row.entry_id,
    });
    row.issuance_snapshot = {
      version: 1,
      tenant_id: row.tenant_id,
      student_user_id: row.student_user_id,
      session_id: row.session_id,
      registration_id: row.registration_id,
      window_id: row.window_id,
      approval_id: row.approval_id,
      semester: 4,
      approved_at: date,
      reviewed_at: date,
      document_bytes: bytes.length,
      exams: [
        {
          exam_schedule_id: randomUUID(),
          course_id: randomUUID(),
          subject_id: 7,
          room: 'Room 1',
          seat_number: 'A1',
        },
      ],
    };
    let rows = [row];
    const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>((sql) =>
      Promise.resolve(
        sql.includes('FROM exam_admit_card_entries e')
          ? rows
          : [{ id: 'locked' }],
      ),
    );
    const manager = { query };
    const db = {
      manager,
      transaction: jest.fn(
        async (callback: (m: typeof manager) => Promise<unknown>) =>
          callback(manager),
      ),
    };
    const storage = {
      getDownloadStream: jest.fn(() => Promise.resolve(Readable.from([bytes]))),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const check = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
    const service = new IssuedHallTicketService(
      db as never,
      storage as never,
      audit as never,
    );
    const download = () =>
      service.download(row.student_user_id, row.tenant_id, row.entry_id, check);
    return {
      row,
      bytes,
      query,
      manager,
      db,
      storage,
      audit,
      check,
      service,
      download,
      setRows: (value: typeof rows) => {
        rows = value;
      },
    };
  }

  it('returns exact stored bytes after record authorization and transactional audit', async () => {
    const f = fixture();
    await expect(f.download()).resolves.toEqual(f.bytes);
    expect(f.storage.getDownloadStream).toHaveBeenCalledWith(f.row.pdf_path);
    expect(f.check).toHaveBeenCalledTimes(1);
    expect(f.audit.log).toHaveBeenCalledWith(
      f.row.tenant_id,
      f.row.student_user_id,
      expect.objectContaining({
        action: 'HALL_TICKET_DOCUMENT_RETRIEVED',
        resource_id: f.row.entry_id,
      }),
      f.manager,
    );
    expect(
      f.query.mock.calls
        .filter(([sql]) => sql.includes('FOR SHARE'))
        .map(([sql]) => sql.match(/FROM (\w+)/)?.[1]),
    ).toEqual([
      'exam_sessions',
      'exam_form_windows',
      'exam_semester_registrations',
      'hall_ticket_approvals',
      'exam_admit_card_entries',
    ]);
    expect(f.query.mock.calls[0][1]).toEqual([
      f.row.tenant_id,
      f.row.student_user_id,
      f.row.entry_id,
    ]);
  });

  it('returns no storage reference or student information in the issued list', async () => {
    const f = fixture();
    const result = await f.service.list(f.row.student_user_id, f.row.tenant_id);
    expect(result).toEqual([
      {
        entry_id: f.row.entry_id,
        session_id: f.row.session_id,
        session_name: f.row.session_name,
        semester: 4,
        issued_at: f.row.issued_at,
        status: 'ISSUED',
      },
    ]);
    expect(f.storage.getDownloadStream).not.toHaveBeenCalled();
  });

  it('excludes duplicate issued tickets by tenant, student and session, even for different approvals', async () => {
    const f = fixture();
    await f.service.list(f.row.student_user_id, f.row.tenant_id);
    await f.download();
    const reads = f.query.mock.calls.filter(([sql]) =>
      sql.includes('FROM exam_admit_card_entries e'),
    );
    // Assert the real SQL predicate; these mocked calls do not prove database
    // locking or constraint behavior. Initial and locked reads must agree.
    expect(reads).toHaveLength(3);
    for (const [sql] of reads) {
      expect(sql).toContain('duplicate.tenant_id=e.tenant_id');
      expect(sql).toContain('duplicate.student_user_id=e.student_user_id');
      expect(sql).toContain('duplicate.session_id=e.session_id');
      expect(sql).toContain('duplicate.issued_at IS NOT NULL');
      expect(sql).toContain('duplicate.entry_id<>e.entry_id');
      expect(sql).not.toContain('duplicate.approval_id=e.approval_id');
    }
  });

  it('does not read storage when there is no authorized issued record', async () => {
    const f = fixture();
    f.setRows([]);
    await expect(f.download()).rejects.toBeInstanceOf(NotFoundException);
    expect(f.storage.getDownloadStream).not.toHaveBeenCalled();
    expect(f.check).not.toHaveBeenCalled();
  });

  it('rejects ambiguous issuance instead of choosing the first record', async () => {
    const f = fixture();
    f.setRows([f.row, { ...f.row, entry_id: randomUUID() }]);
    await expect(
      f.service.download(
        f.row.student_user_id,
        f.row.tenant_id,
        undefined,
        f.check,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.storage.getDownloadStream).not.toHaveBeenCalled();
  });

  it('rejects multiple returned tickets for a session even when approvals differ', async () => {
    const f = fixture();
    f.setRows([
      f.row,
      { ...f.row, entry_id: randomUUID(), approval_id: randomUUID() },
    ]);
    await expect(f.download()).rejects.toBeInstanceOf(ConflictException);
    expect(f.check).not.toHaveBeenCalled();
    expect(f.db.transaction).not.toHaveBeenCalled();
    expect(f.storage.getDownloadStream).not.toHaveBeenCalled();
    expect(f.audit.log).not.toHaveBeenCalled();
  });

  it('does not retrieve a ticket excluded by the locked duplicate-scope recheck', async () => {
    const f = fixture();
    let readCount = 0;
    f.query.mockImplementation((sql) => {
      if (!sql.includes('FROM exam_admit_card_entries e'))
        return Promise.resolve([{ id: 'locked' }]);
      readCount++;
      // A conflicting issued entry has committed before the locked recheck.
      // PostgreSQL execution of the predicate needs separate integration proof.
      return Promise.resolve(readCount === 1 ? [f.row] : []);
    });
    await expect(f.download()).rejects.toBeInstanceOf(NotFoundException);
    expect(readCount).toBe(2);
    expect(f.check).toHaveBeenCalledTimes(1);
    expect(f.storage.getDownloadStream).not.toHaveBeenCalled();
    expect(f.audit.log).not.toHaveBeenCalled();
  });

  it.each([
    'tenant_id',
    'student_user_id',
    'session_id',
    'registration_id',
    'window_id',
    'approval_id',
    'semester',
    'version',
    'approved_at',
    'reviewed_at',
  ])('rejects an inconsistent %s snapshot', async (field) => {
    const f = fixture();
    f.row.issuance_snapshot[field] = 'wrong';
    await expect(f.download()).rejects.toBeInstanceOf(NotFoundException);
    expect(f.storage.getDownloadStream).not.toHaveBeenCalled();
  });

  it.each([
    'https://evil.invalid/file.pdf',
    '../../private.pdf',
    's3://bucket/file.pdf',
    '/uploads/other-student.pdf',
  ])(
    'rejects forged storage reference %s before storage access',
    async (path) => {
      const f = fixture();
      f.row.pdf_path = path;
      await expect(f.download()).rejects.toBeInstanceOf(NotFoundException);
      expect(f.storage.getDownloadStream).not.toHaveBeenCalled();
    },
  );

  it('revalidates approval after acquiring locks', async () => {
    const f = fixture();
    f.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM hall_ticket_approvals WHERE')) f.setRows([]);
      return Promise.resolve(
        sql.includes('FROM exam_admit_card_entries e')
          ? []
          : ([{ id: 'locked' }] as never),
      );
    });
    f.query.mockResolvedValueOnce([f.row] as never);
    await expect(f.download()).rejects.toBeInstanceOf(NotFoundException);
    expect(f.storage.getDownloadStream).not.toHaveBeenCalled();
  });

  it('preserves existing clearance denial without accessing storage', async () => {
    const f = fixture();
    f.check.mockRejectedValue(new ForbiddenException('Pending fee dues'));
    await expect(f.download()).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.storage.getDownloadStream).not.toHaveBeenCalled();
    expect(f.db.transaction).not.toHaveBeenCalled();
  });

  it('runs upstream clearance before acquiring a transaction connection, then rechecks authorization', async () => {
    const f = fixture();
    f.check.mockImplementation(() => {
      expect(f.db.transaction).not.toHaveBeenCalled();
      f.setRows([]);
      return Promise.resolve();
    });
    await expect(f.download()).rejects.toBeInstanceOf(NotFoundException);
    expect(f.storage.getDownloadStream).not.toHaveBeenCalled();
  });

  it('reports unavailable stored files without regenerating or recording success', async () => {
    const f = fixture();
    f.storage.getDownloadStream.mockRejectedValue(new Error('ENOENT'));
    await expect(f.download()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(f.audit.log).not.toHaveBeenCalled();
  });

  it('rejects file corruption', async () => {
    const f = fixture();
    f.storage.getDownloadStream.mockResolvedValue(
      Readable.from([Buffer.from('%PDF-1.4\nchanged document')]),
    );
    await expect(f.download()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(f.audit.log).not.toHaveBeenCalled();
  });

  it('does not return bytes when a required audit fails', async () => {
    const f = fixture();
    f.audit.log.mockRejectedValue(new Error('Audit write failed'));
    await expect(f.download()).rejects.toThrow('Audit write failed');
  });

  it.each([undefined, '', 'invalid'])(
    'rejects tenant %p before querying',
    async (tenant) => {
      const f = fixture();
      await expect(
        f.service.download(
          f.row.student_user_id,
          tenant as never,
          f.row.entry_id,
          f.check,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(f.db.transaction).not.toHaveBeenCalled();
    },
  );

  it('the existing endpoint service never invokes the PDF generator', async () => {
    const f = fixture();
    const pdf = { generate: jest.fn() };
    const service = new ExamsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { getPendingDues: jest.fn().mockResolvedValue([]) } as never,
      pdf as never,
      {
        evaluate: jest.fn().mockResolvedValue({
          eligible: true,
          attendance_percent: 90,
          effective_threshold: 75,
        }),
      } as never,
      f.service,
    );
    await expect(
      service.generateAdmitCardOrThrow(
        f.row.student_user_id,
        f.row.tenant_id,
        f.row.entry_id,
      ),
    ).resolves.toEqual(f.bytes);
    expect(pdf.generate).not.toHaveBeenCalled();
  });
  it('passes verified document course and semester scope to clearance', async () => {
    const f = fixture();
    await f.download();
    expect(f.check).toHaveBeenCalledWith({
      semester: 4,
      courseIds: [
        (f.row.issuance_snapshot.exams as Array<{ course_id: string }>)[0]
          .course_id,
      ],
    });
  });

  it.each([
    {
      eligible: false,
      attendance_percent: 90,
      effective_threshold: 75,
      reason: null,
    },
    { eligible: undefined, attendance_percent: 90, effective_threshold: 75 },
    { eligible: true, attendance_percent: NaN, effective_threshold: 75 },
  ])(
    'rejects denied or malformed attendance before reading storage: %p',
    async (attendance) => {
      const f = fixture();
      const evaluator = { evaluate: jest.fn().mockResolvedValue(attendance) };
      const service = new ExamsService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { getPendingDues: jest.fn().mockResolvedValue([]) } as never,
        { generate: jest.fn() } as never,
        evaluator as never,
        f.service,
      );
      await expect(
        service.generateAdmitCardOrThrow(
          f.row.student_user_id,
          f.row.tenant_id,
          f.row.entry_id,
        ),
      ).rejects.toThrow();
      expect(evaluator.evaluate).toHaveBeenCalledWith(
        f.row.tenant_id,
        f.row.student_user_id,
        expect.objectContaining({
          strict: true,
          semester: 4,
          context: 'ADMIT_CARD',
        }),
      );
      expect(f.storage.getDownloadStream).not.toHaveBeenCalled();
    },
  );

  it('does not let new generic dues alone block an issued-ticket download', async () => {
    const f = fixture();
    const finance = {
      getPendingDues: jest
        .fn()
        .mockResolvedValue([
          { fee_head: 'HOSTEL_DAMAGE', total_amount: 100, paid_amount: 0 },
        ]),
    };
    const pdf = { generate: jest.fn() };
    const service = new ExamsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      finance as never,
      pdf as never,
      {
        evaluate: jest.fn().mockResolvedValue({
          eligible: true,
          attendance_percent: 90,
          effective_threshold: 75,
        }),
      } as never,
      f.service,
    );
    await expect(
      service.generateAdmitCardOrThrow(
        f.row.student_user_id,
        f.row.tenant_id,
        f.row.entry_id,
      ),
    ).resolves.toEqual(f.bytes);
    expect(finance.getPendingDues).not.toHaveBeenCalled();
    expect(f.storage.getDownloadStream).toHaveBeenCalledWith(f.row.pdf_path);
    expect(pdf.generate).not.toHaveBeenCalled();
  });
});
