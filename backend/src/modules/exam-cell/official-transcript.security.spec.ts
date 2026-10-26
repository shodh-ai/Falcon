import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EnterpriseAuditService } from '../../core/audit/enterprise-audit.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { OfficialTranscriptPdfService } from './official-transcript-pdf.service';
import { OfficialTranscriptService } from './official-transcript.service';

describe('official transcript batch candidate security (mocked database)', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';
  const actor = {
    userId: '22222222-2222-4222-8222-222222222222',
    role: 'ExamCell',
  };

  function fixture() {
    const query = jest
      .fn<Promise<Array<Record<string, unknown>>>, [string, unknown[]]>()
      .mockResolvedValue([]);
    const pdf = { generate: jest.fn() };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const notify = { transcriptGenerated: jest.fn() };
    const service = new OfficialTranscriptService(
      { query } as unknown as DataSource,
      pdf as unknown as OfficialTranscriptPdfService,
      audit as unknown as EnterpriseAuditService,
      notify as unknown as NotificationEmitterService,
    );
    return { service, query, pdf, audit, notify };
  }

  it('selects only tenant/semester students with matching dual-declared reports and does not generate for an empty roster', async () => {
    const { service, query, pdf } = fixture();
    await expect(service.requestForSemester(tenant, 4, actor)).resolves.toEqual(
      { semester: 4, requested: 0, transcript_ids: [] },
    );
    const sql = query.mock.calls[1][0];
    expect(sql).toContain('e.tenant_id = u.tenant_id');
    expect(sql).toContain('e.tenant_id = $1 AND e.semester = $2');
    expect(sql).toContain(
      's.tenant_id = r.tenant_id AND s.course_id = r.course_id',
    );
    expect(sql).toContain('s.exam_type = r.exam_type');
    expect(sql).toContain(
      'r.tenant_id = e.tenant_id AND r.student_user_id = e.student_user_id',
    );
    expect(sql).toContain('s.semester = e.semester');
    expect(sql).toContain(
      'r.declared_at IS NOT NULL AND s.declared_at IS NOT NULL',
    );
    expect(query.mock.calls[1][1]).toEqual([tenant, 4]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(pdf.generate).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', '   '])(
    'rejects missing tenant context %p before querying',
    async (value) => {
      const { service, query, pdf } = fixture();
      await expect(
        service.requestForSemester(value as unknown as string, 4, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
      expect(pdf.generate).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 1.5, NaN])(
    'rejects invalid semester %p before querying',
    async (semester) => {
      const { service, query } = fixture();
      await expect(
        service.requestForSemester(tenant, semester, actor),
      ).rejects.toThrow('Valid semester is required');
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('preserves existing UFM blockers even for a candidate returned by the official report query', async () => {
    const { service, query, pdf } = fixture();
    const student = '33333333-3333-4333-8333-333333333333';
    query
      .mockReset()
      .mockResolvedValueOnce([{ student_user_id: student }])
      .mockResolvedValueOnce([{ user_id: student }]);
    await expect(
      service.requestForSemester(tenant, 4, actor),
    ).resolves.toMatchObject({ requested: 0 });
    expect(query).toHaveBeenCalledTimes(2);
    expect(pdf.generate).not.toHaveBeenCalled();
  });

  describe('tenant transcript screen listing', () => {
    it('returns the existing flat response while requiring authoritative declared results and excluding withheld semesters', async () => {
      const { service, query } = fixture();
      const rows = [
        {
          transcript_id: '44444444-4444-4444-8444-444444444444',
          student_name: 'Declared result student',
          enrollment_no: 'TRANSCRIPT-LIST',
          semester: 4,
          status: 'GENERATED',
          generated_at: '2026-10-24T10:00:00.000Z',
        },
      ];
      query.mockResolvedValueOnce(rows);
      await expect(
        service.listForTenant(tenant, { semester: 4, status: 'GENERATED' }),
      ).resolves.toEqual(rows);
      expect(query).toHaveBeenCalledTimes(1);
      const sql = query.mock.calls[0][0].replace(/\s+/g, ' ');
      expect(sql).toContain('u.tenant_id = t.tenant_id');
      expect(sql).toContain('sp.tenant_id = t.tenant_id');
      expect(sql).toContain('t.tenant_id = $1');
      expect(sql).toContain('FROM student_exam_reports r');
      expect(sql).toContain('s.tenant_id = r.tenant_id');
      expect(sql).toContain('s.course_id = r.course_id');
      expect(sql).toContain('s.exam_type = r.exam_type');
      expect(sql).toContain('r.tenant_id = t.tenant_id');
      expect(sql).toContain('r.student_user_id = t.student_user_id');
      expect(sql).toContain('s.semester = t.semester');
      expect(sql).toContain('r.declared_at IS NOT NULL');
      expect(sql).toContain('s.declared_at IS NOT NULL');
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain("'WITHHELD'");
      expect(sql).not.toContain('academic_marks');
      expect(query.mock.calls[0][1]).toEqual([tenant, 'GENERATED', 4]);
    });

    it('returns an empty array when there are no authorized officially declared transcripts', async () => {
      const { service, query } = fixture();
      await expect(service.listForTenant(tenant)).resolves.toEqual([]);
      expect(query).toHaveBeenCalledTimes(1);
      const sql = query.mock.calls[0][0];
      expect(sql).not.toContain("t.status = 'GENERATED'");
      expect(query.mock.calls[0][1]).toEqual([tenant]);
    });

    it.each([undefined, null, '', '   ', 'not-a-tenant'])(
      'rejects invalid tenant %p before listing database access',
      async (value) => {
        const { service, query } = fixture();
        await expect(
          service.listForTenant(value as unknown as string),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(query).not.toHaveBeenCalled();
      },
    );

    it.each([0, -1, 1.5, NaN, Infinity])(
      'rejects invalid list semester %p before querying',
      async (semester) => {
        const { service, query } = fixture();
        await expect(
          service.listForTenant(tenant, { semester }),
        ).rejects.toThrow('Valid semester is required');
        expect(query).not.toHaveBeenCalled();
      },
    );

    it('propagates database errors instead of disguising failed loading as an empty roster', async () => {
      const { service, query } = fixture();
      query.mockRejectedValueOnce(new Error('transcript list unavailable'));
      await expect(service.listForTenant(tenant)).rejects.toThrow(
        'transcript list unavailable',
      );
    });
  });

  describe('existing generation and approval response contract', () => {
    const transcript = '44444444-4444-4444-8444-444444444444';
    const student = '33333333-3333-4333-8333-333333333333';
    const generated = {
      verificationCode: 'ABCDEF0123456789',
      url: '/uploads/authorized-transcript.pdf',
      buffer: Buffer.from('%PDF-unit-fixture'),
    };

    it('archives the generated document and forwards the actual student and semester from flat PostgreSQL result rows', async () => {
      const { service, query, pdf, audit, notify } = fixture();
      query
        .mockReset()
        .mockResolvedValueOnce([{ status: 'APPROVED' }])
        .mockResolvedValueOnce([{ student_user_id: student, semester: 4 }])
        .mockResolvedValueOnce([]);
      pdf.generate.mockResolvedValueOnce(generated);

      await expect(
        service.generatePdf(tenant, transcript, actor),
      ).resolves.toEqual({
        transcript_id: transcript,
        verification_code: generated.verificationCode,
        pdf_url: generated.url,
        status: 'ARCHIVED',
      });
      expect(pdf.generate).toHaveBeenCalledWith(tenant, transcript);
      expect(query.mock.calls[1][0]).toMatch(/WITH\s+updated\s+AS/i);
      expect(query.mock.calls[1][0]).toMatch(
        /SELECT\s+student_user_id,\s*semester\s+FROM\s+updated/i,
      );
      expect(query.mock.calls[1][1]).toEqual([
        transcript,
        tenant,
        generated.verificationCode,
        generated.url,
      ]);
      expect(query.mock.calls[2][0]).toContain("status = 'ARCHIVED'");
      expect(notify.transcriptGenerated).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: tenant,
          userId: student,
          semester: 4,
          verificationCode: generated.verificationCode,
          actionLink: '/student/transcripts',
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: tenant,
          userId: actor.userId,
          action: 'TRANSCRIPT_GENERATED',
          recordId: transcript,
          newValue: expect.objectContaining({ status: 'ARCHIVED' }) as unknown,
        }),
      );
    });

    it('does not audit or generate when the requested transcript is not pending approval', async () => {
      const { service, query, pdf, audit, notify } = fixture();
      await expect(service.approve(tenant, transcript, actor)).rejects.toThrow(
        'Transcript is not pending approval',
      );
      expect(query.mock.calls[0][0]).toMatch(/WITH\s+updated\s+AS/i);
      expect(query.mock.calls[0][0]).toMatch(/SELECT\s+\*\s+FROM\s+updated/i);
      expect(query).toHaveBeenCalledTimes(1);
      expect(pdf.generate).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
      expect(notify.transcriptGenerated).not.toHaveBeenCalled();
    });

    it('preserves approval, audit, generation and archived response for an existing pending request', async () => {
      const { service, query, pdf, audit, notify } = fixture();
      query
        .mockReset()
        .mockResolvedValueOnce([{ transcript_id: transcript }])
        .mockResolvedValueOnce([{ status: 'APPROVED' }])
        .mockResolvedValueOnce([{ student_user_id: student, semester: 4 }])
        .mockResolvedValueOnce([]);
      pdf.generate.mockResolvedValueOnce(generated);
      await expect(
        service.approve(tenant, transcript, actor),
      ).resolves.toMatchObject({
        transcript_id: transcript,
        status: 'ARCHIVED',
      });
      expect(audit.log).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          action: 'TRANSCRIPT_APPROVED',
          tenantId: tenant,
          recordId: transcript,
        }),
      );
      expect(audit.log).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ action: 'TRANSCRIPT_GENERATED' }),
      );
      expect(notify.transcriptGenerated).toHaveBeenCalledWith(
        expect.objectContaining({ userId: student, semester: 4 }),
      );
    });

    it('propagates PDF failure without updating document state, auditing success or notifying', async () => {
      const { service, query, pdf, audit, notify } = fixture();
      query.mockResolvedValueOnce([{ status: 'APPROVED' }]);
      pdf.generate.mockRejectedValueOnce(new Error('PDF generation failed'));
      await expect(
        service.generatePdf(tenant, transcript, actor),
      ).rejects.toThrow('PDF generation failed');
      expect(query).toHaveBeenCalledTimes(1);
      expect(audit.log).not.toHaveBeenCalled();
      expect(notify.transcriptGenerated).not.toHaveBeenCalled();
    });

    it('propagates generated-record persistence failure instead of returning archived success or notifying', async () => {
      const { service, query, pdf, audit, notify } = fixture();
      query
        .mockReset()
        .mockResolvedValueOnce([{ status: 'APPROVED' }])
        .mockRejectedValueOnce(new Error('transcript update unavailable'));
      pdf.generate.mockResolvedValueOnce(generated);
      await expect(
        service.generatePdf(tenant, transcript, actor),
      ).rejects.toThrow('transcript update unavailable');
      expect(query).toHaveBeenCalledTimes(2);
      expect(audit.log).not.toHaveBeenCalled();
      expect(notify.transcriptGenerated).not.toHaveBeenCalled();
    });
  });
});
