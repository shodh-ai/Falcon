import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';

jest.mock('uuid', () => ({ v4: jest.fn() }));

describe('faculty publication validation and date contract', () => {
  const tenant = '10000000-0000-4000-8000-000000000001';
  const faculty = '20000000-0000-4000-8000-000000000001';
  const query = jest.fn();
  let service: FacultyWorkspacesService;

  beforeEach(() => {
    jest.resetAllMocks();
    query.mockResolvedValue([{ research_id: 'test', published_date: '2024-02-29' }]);
    service = Object.assign(Object.create(FacultyWorkspacesService.prototype), { dataSource: { query } });
  });

  it('returns stable date-only values and keeps list ownership scoped to an active tenant account', async () => {
    await service.listResearchLogs(faculty, tenant);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('r.published_date::text AS published_date');
    expect(sql).toContain('u.tenant_id = r.tenant_id');
    expect(sql).toContain('u.is_active = true AND u.deleted_at IS NULL');
    expect(params).toEqual([tenant, faculty]);
  });

  it('trims optional metadata, preserves a leap date and guards the insert by owner tenant', async () => {
    await service.createResearchLog(faculty, tenant, {
      publication_title: '  Publication  ', journal_name: '  Journal  ', indexing_type: ' WOS ',
      publication_type: ' BOOK_CHAPTER ', published_date: ' 2024-02-29 ',
      proof_file_path: ` /uploads/${tenant}/2026/10/proof.pdf `,
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('FROM users u');
    expect(sql).toContain('u.user_id = $2 AND u.tenant_id = $1');
    expect(sql).toContain('RETURNING *, published_date::text AS published_date');
    expect(params).toEqual([tenant, faculty, 'Publication', 'Journal', 'WOS', 'BOOK_CHAPTER', '2024-02-29', `/uploads/${tenant}/2026/10/proof.pdf`]);
  });

  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '0000-01-01', '2026-10-19T00:00:00Z', 'tomorrow'])
    ('rejects invalid calendar date %s before SQL', async date => {
      await expect(service.createResearchLog(faculty, tenant, { publication_title: 'Test', published_date: date }))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

  it.each([
    { journal_name: 'x'.repeat(256) }, { journal_name: {} }, { indexing_type: 'INVALID' },
    { publication_type: 'INVALID' }, { publication_type: '' }, { published_date: 123 },
    { proof_file_path: 123 }, { proof_file_path: 'javascript:alert(1)' },
    { proof_file_path: '/uploads/another-tenant/proof.pdf' },
    { proof_file_path: `/uploads/${tenant}/%2e%2e/proof.pdf` },
    { proof_file_path: `s3://bucket/${tenant}/../proof.pdf` },
  ])('rejects malformed metadata or out-of-scope proof %p', async metadata => {
    await expect(service.createResearchLog(faculty, tenant, { publication_title: 'Test', ...metadata } as never))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('accepts a tenant-scoped S3 upload reference and has no future-date policy', async () => {
    await service.createResearchLog(faculty, tenant, { publication_title: 'Test', published_date: '2099-01-01',
      proof_file_path: `s3://bucket/${tenant}/2026/10/proof.pdf` });
    expect(query.mock.calls[0][1][6]).toBe('2099-01-01');
  });

  it('normalizes blank optional fields while preserving the default publication type', async () => {
    await service.createResearchLog(faculty, tenant, { publication_title: 'Test', journal_name: ' ', indexing_type: ' ', published_date: '', proof_file_path: '' });
    expect(query.mock.calls[0][1]).toEqual([tenant, faculty, 'Test', null, null, 'JOURNAL', null, null]);
  });

  it('fails closed if the publication owner is inactive or outside the tenant', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.createResearchLog(faculty, tenant, { publication_title: 'Test' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
