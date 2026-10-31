import { ConfigService } from '@nestjs/config';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { resolve } from 'path';
import { UploadsService } from './uploads.service';

describe('Student upload download authorization', () => {
  const tenant = 'tenant-a';
  const student = {
    tenant_id: tenant,
    user_id: 'student-a',
    roles: ['Student'],
  };
  const key = `${tenant}/2026/10/document.pdf`;
  const query = jest.fn();
  const root = resolve('uploads');
  let service: UploadsService;

  beforeEach(() => {
    query.mockReset();
    service = new UploadsService(new ConfigService({ UPLOAD_PATH: root }), {
      query,
    } as unknown as DataSource);
  });

  it.each(['Student', 'Faculty', 'ExamCell', 'SuperAdmin'])(
    'requires the dedicated question-paper endpoint even for %s',
    async (role) => {
      await expect(
        service.assertStudentDownloadAccess(
          { ...student, roles: [role] },
          `${tenant}/exam-cell/question-papers/private.pdf`,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([`/uploads/${key}`, `s3://bucket/${key}`, key, resolve(root, key)])(
    'accepts an owned legacy reference: %s',
    async (reference) => {
      query.mockImplementation((sql: string) =>
        Promise.resolve(
          sql.includes('student_onboarding_docs')
            ? [{ file_reference: reference }]
            : [],
        ),
      );
      await expect(
        service.assertStudentDownloadAccess(student, key),
      ).resolves.toBeUndefined();
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('student_onboarding_docs'),
        [tenant, 'student-a'],
      );
    },
  );

  it('does not accept another student file merely because it is in the same tenant', async () => {
    query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('student_onboarding_docs')
          ? [{ file_reference: '/uploads/tenant-a/2026/10/own.pdf' }]
          : [],
      ),
    );
    await expect(
      service.assertStudentDownloadAccess(student, key),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails closed when document lookup fails', async () => {
    query.mockRejectedValue(new Error('Database unavailable'));
    await expect(
      service.assertStudentDownloadAccess(student, key),
    ).rejects.toThrow('File not found');
  });

  it('does not trust a self-edited profile photo URL as file ownership', async () => {
    const forgedOtherStudentFile = `${tenant}/2026/10/student-b-private.pdf`;
    // The forged profile value can be returned only if that editable column is queried.
    query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('student_profiles')
          ? [{ file_reference: `/uploads/${forgedOtherStudentFile}` }]
          : [],
      ),
    );
    await expect(
      service.assertStudentDownloadAccess(student, forgedOtherStudentFile),
    ).rejects.toBeInstanceOf(NotFoundException);
    const [sql] = query.mock.calls.find(([statement]) =>
      statement.includes('student_onboarding_docs'),
    ) as [string];
    expect(sql).not.toContain('profile_photo_url');
    expect(sql).toContain('student_onboarding_docs');
  });

  it('checks weekly timing, enrollment, activity and existing submission before allowing a shared paper', async () => {
    query.mockResolvedValue([{ file_reference: `/uploads/${key}` }]);
    await service.assertStudentDownloadAccess(student, key);
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain(
      'e.tenant_id = t.tenant_id AND e.student_user_id = $2',
    );
    expect(sql).toContain("e.status = 'ENROLLED' AND e.deleted_at IS NULL");
    expect(sql).toContain('t.is_active = true');
    expect(sql).toContain("t.status IN ('SCHEDULED', 'ACTIVE')");
    expect(sql).toContain('t.start_time <= NOW() AND t.end_time > NOW()');
    expect(sql).toContain('r.student_user_id = $2');
    expect(sql).toContain('r.submitted_at IS NOT NULL');
    expect(sql).not.toContain('university_policies');
  });

  it('opens an eligible paper without querying unrelated legacy document tables', async () => {
    query.mockImplementation((sql: string) =>
      sql.includes('student_onboarding_docs')
        ? Promise.reject(new Error('legacy document schema unavailable'))
        : Promise.resolve([{ file_reference: `/uploads/${key}` }]),
    );
    await service.assertStudentDownloadAccess(student, key);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('checks policy files only when the optional policy table exists', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ relation: 'university_policies' }])
      .mockResolvedValueOnce([{ file_reference: `/uploads/${key}` }]);
    await service.assertStudentDownloadAccess(student, key);
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('fails closed for unmatched files when the policy table is absent', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ relation: null }]);
    await expect(
      service.assertStudentDownloadAccess(student, key),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gives Applicants only owned references without campus policies or test papers', async () => {
    query.mockResolvedValue([{ file_reference: `/uploads/${key}` }]);
    await service.assertStudentDownloadAccess(
      { ...student, roles: ['Applicant'] },
      key,
    );
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain('student_onboarding_docs');
    expect(sql).not.toContain('weekly_tests');
    expect(sql).not.toContain('university_policies');
    expect(sql).toContain("t.student_user_id = $2 AND t.status = 'SUCCESS'");
  });

  it('requires a real authenticated student identity', async () => {
    await expect(
      service.assertStudentDownloadAccess(
        { roles: ['Student'], tenant_id: tenant },
        key,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(query).not.toHaveBeenCalled();
  });

  it('allows a new server-owned Student folder but never another user or tenant folder', async () => {
    await service.assertStudentDownloadAccess(
      student,
      `${tenant}/students/student-a/new.pdf`,
    );
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValue([]);
    await expect(
      service.assertStudentDownloadAccess(
        student,
        `${tenant}/students/student-b/new.pdf`,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.assertStudentDownloadAccess(
        student,
        'tenant-b/students/student-a/new.pdf',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.assertStudentDownloadAccess(
        student,
        `${tenant}/students/student-a/../../student-b/new.pdf`,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('leaves staff and multi-hat staff authorization to the existing shared route roles', async () => {
    await service.assertStudentDownloadAccess(
      { tenant_id: tenant, user_id: 'staff', roles: ['Faculty'] },
      key,
    );
    await service.assertStudentDownloadAccess(
      { ...student, roles: ['Student', 'Faculty'] },
      key,
    );
    expect(query).not.toHaveBeenCalled();
  });
});
