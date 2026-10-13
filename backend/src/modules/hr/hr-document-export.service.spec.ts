import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { HrDocumentExportService } from './hr-document-export.service';

// Jest runs CommonJS and cannot load archiver v8's ESM entrypoint. The runtime
// archive implementation is exercised separately; these tests cover job and
// missing-file behavior without changing production module loading.
jest.mock('archiver', () => {
  const { EventEmitter } = require('events') as typeof import('events');
  class TestZipArchive extends EventEmitter {
    append(value: unknown) {
      if (value && typeof value === 'object' && 'destroy' in value) {
        const stream = value as {
          on: (event: string, fn: () => void) => void;
          destroy: () => void;
        };
        stream.on('error', () => undefined);
        stream.destroy();
      }
      return this;
    }
    async finalize() {
      this.emit('data', Buffer.from('PK-test-archive'));
      this.emit('end');
    }
  }
  return { ZipArchive: TestZipArchive };
});

describe('HrDocumentExportService partial exports', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const jobId = '20000000-0000-4000-8000-000000000002';
  let tempRoot: string;
  let previousUploadPath: string | undefined;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'falcon-hr-export-'));
    previousUploadPath = process.env.UPLOAD_PATH;
    process.env.UPLOAD_PATH = tempRoot;
  });

  afterEach(() => {
    if (previousUploadPath === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = previousUploadPath;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  function makeService(
    documents: Array<Record<string, unknown>>,
    exportJob?: Record<string, unknown> | null,
    reportScope?: Record<string, unknown> | null,
  ) {
    const storedJob = exportJob === undefined
      ? {
          job_id: jobId,
          tenant_id: tenantId,
          entity_id: 7,
          requested_by: 'requester-id',
          status: 'QUEUED',
          filters: { document_type: 'ALL' },
          current_department_scope: null,
        }
      : exportJob === null
        ? null
        : {
            tenant_id: tenantId,
            entity_id: 7,
            requested_by: 'requester-id',
            filters: { document_type: 'ALL' },
            current_department_scope: null,
            ...exportJob,
          };
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM hr_document_export_jobs j')) {
        return Promise.resolve(storedJob ? [storedJob] : []);
      }
      if (sql.includes('SELECT can_view, entity_scope, department_scope')) {
        return Promise.resolve(reportScope ? [reportScope] : []);
      }
      if (sql.includes('COUNT(*)::int AS cnt')) {
        return Promise.resolve([{ cnt: documents.length }]);
      }
      if (sql.includes('INSERT INTO hr_document_export_jobs')) {
        return Promise.resolve([{ job_id: jobId }]);
      }
      if (sql.includes('ORDER BY u.name')) return Promise.resolve(documents);
      return Promise.resolve([]);
    });
    const notify = { exportReady: jest.fn(), exportFailed: jest.fn() };
    const storage = {
      isEnabled: jest.fn().mockReturnValue(false),
      getBucketName: jest.fn().mockReturnValue('falcon-uploads'),
      getPresignedDownloadUrl: jest.fn(),
    };
    const exportQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new HrDocumentExportService(
      { query } as never,
      exportQueue as never,
      storage as never,
      notify as never,
    );
    const job = {
      jobId,
      tenantId,
      entityId: 7,
      requestedBy: 'requester-id',
      filters: { document_type: 'ALL' as const },
    };
    return { service, query, notify, job, exportQueue, storage };
  }

  it('produces a ZIP and named missing-file manifest when some documents remain readable', async () => {
    const tenantRoot = join(tempRoot, tenantId);
    mkdirSync(tenantRoot, { recursive: true });
    const available = join(tenantRoot, 'available.pdf');
    writeFileSync(available, 'sample document');
    const { service, query, notify, job } = makeService([
      {
        document_id: 'available-id',
        file_url: available,
        file_name: 'available.pdf',
        document_type: 'DEGREE',
        employee_name: 'Employee One',
        employee_id: 'E001',
      },
      {
        document_id: 'missing-id',
        file_url: join(tenantRoot, 'missing.pdf'),
        file_name: 'missing.pdf',
        document_type: 'PAN',
        employee_name: 'Employee Two',
        employee_id: 'E002',
      },
    ]);

    await expect(service.runExport(job)).resolves.toMatchObject({
      document_count: 1,
      skipped_count: 1,
    });
    const completed = query.mock.calls.find(([sql]) =>
      sql.includes("status = 'COMPLETED'"),
    );
    expect(completed?.[1][3]).toContain('1 of 2 matched document(s)');
    const zipPath = join(
      tempRoot,
      tenantId,
      'exports',
      jobId,
      'All_ALL_Export.zip',
    );
    expect(readFileSync(zipPath).subarray(0, 2).toString()).toBe('PK');
    expect(notify.exportReady).toHaveBeenCalledTimes(1);
    expect(notify.exportFailed).not.toHaveBeenCalled();
  });

  it('reports exact unavailable document IDs when no files can be read', async () => {
    const { service, query, notify, job } = makeService([
      {
        document_id: 'missing-id',
        file_url: join(tempRoot, 'missing.pdf'),
        file_name: 'missing.pdf',
        document_type: 'PAN',
        employee_name: 'Employee Two',
        employee_id: 'E002',
      },
    ]);
    await expect(service.runExport(job)).rejects.toThrow('missing-id');
    const failed = query.mock.calls.find(([sql]) =>
      sql.includes("status = 'FAILED'"),
    );
    expect(failed?.[1][1]).toContain(
      'Check the source uploads or S3/MinIO object keys',
    );
    expect(notify.exportFailed).toHaveBeenCalledTimes(1);
  });

  it('skips an existing file outside the export tenant', async () => {
    const foreignPath = join(tempRoot, 'other-tenant', 'private.pdf');
    mkdirSync(join(tempRoot, 'other-tenant'), { recursive: true });
    writeFileSync(foreignPath, 'private data');
    const { service, job } = makeService([
      {
        document_id: 'foreign-id',
        file_url: foreignPath,
        file_name: 'private.pdf',
        document_type: 'PAN',
        employee_name: 'Employee Two',
        employee_id: 'E002',
      },
    ]);
    await expect(service.runExport(job)).rejects.toThrow('foreign-id');
  });

  it('uses the same tenant and legacy-document entity predicate for job count and worker', async () => {
    const tenantRoot = join(tempRoot, tenantId);
    mkdirSync(tenantRoot, { recursive: true });
    const available = join(tenantRoot, 'available.pdf');
    writeFileSync(available, 'sample document');
    const { service, query, job, exportQueue } = makeService([
      {
        document_id: 'available-id',
        file_url: available,
        file_name: 'available.pdf',
        document_type: 'PAN',
        employee_name: 'Employee One',
        employee_id: 'E001',
      },
    ]);

    await service.createExportJob(tenantId, 7, 'requester-id', job.filters);
    await service.runExport(job);

    const scopeClause =
      '(d.entity_id = $2 OR (d.entity_id IS NULL AND COALESCE(p.entity_id, u.entity_id) = $2))';
    const countCall = query.mock.calls.find(([sql]) =>
      sql.includes('COUNT(*)::int AS cnt'),
    );
    const workerCall = query.mock.calls.find(([sql]) =>
      sql.includes('ORDER BY u.name'),
    );
    for (const call of [countCall, workerCall]) {
      expect(call?.[0]).toContain(
        'u.user_id = d.user_id AND u.tenant_id = d.tenant_id',
      );
      expect(call?.[0]).toContain(scopeClause);
      expect(call?.[1]).toEqual([tenantId, 7]);
    }
    expect(exportQueue.add).toHaveBeenCalledTimes(1);
  });

  it('fails closed before querying documents when entity scope is invalid', async () => {
    const { service, query, job } = makeService([
      {
        document_id: 'private-id',
        file_url: '/uploads/tenant-a/private.pdf',
        file_name: 'private.pdf',
        document_type: 'PAN',
        employee_name: 'Employee One',
        employee_id: 'E001',
      },
    ]);
    await expect(
      service.createExportJob(tenantId, 0, 'requester-id', job.filters),
    ).rejects.toThrow('valid HR entity scope');
    expect(query).not.toHaveBeenCalled();
  });

  it('requires the requester to remain active with a live HR role in the job entity', async () => {
    const { service, query } = makeService([], null);
    await expect(
      service.getExportJob(tenantId, jobId, 'requester-id'),
    ).rejects.toThrow('no longer accessible');
    const res = { setHeader: jest.fn() };
    await expect(
      service.pipeExportDownload(tenantId, jobId, 'requester-id', res as never),
    ).rejects.toThrow('no longer accessible');
    expect(res.setHeader).not.toHaveBeenCalled();

    for (const [sql, params] of query.mock.calls) {
      expect(sql).toContain('u.is_active = true');
      expect(sql).toContain('oe.is_active = true');
      expect(sql).toContain("r.role_name IN ('HR', 'HRAdmin', 'SuperAdmin')");
      expect(sql).toContain("ac.module_name = 'REPORTS'");
      expect(sql).toContain('NOT (j.entity_id = ANY(ac.entity_scope))');
      expect(params).toEqual([jobId, tenantId, 'requester-id']);
    }
  });

  it('never issues an S3 presigned archive URL that survives HR-role revocation', async () => {
    const { service, storage } = makeService([], {
      job_id: jobId,
      status: 'COMPLETED',
      file_key: `${tenantId}/exports/${jobId}/archive.zip`,
      file_name: 'archive.zip',
      error_message: null,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
    storage.isEnabled.mockReturnValue(true);
    await expect(
      service.getExportJob(tenantId, jobId, 'requester-id'),
    ).resolves.toMatchObject({
      download_url: `/api/hr/documents/export-jobs/${jobId}/download`,
    });
    expect(storage.getPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('freezes REPORTS department scope and applies it to an unfiltered export count', async () => {
    const { service, query, exportQueue } = makeService(
      [{ document_id: 'department-11-document' }],
      undefined,
      { can_view: true, entity_scope: [7], department_scope: [11, 12] },
    );

    await service.createExportJob(tenantId, 7, 'requester-id', {
      document_type: 'ALL',
      // This internal field is deliberately ignored rather than trusted.
      authorized_dept_ids: [99],
    });

    const countCall = query.mock.calls.find(([sql]) =>
      sql.includes('COUNT(*)::int AS cnt'),
    );
    expect(countCall?.[0]).toContain('u.dept_id = ANY($2::int[])');
    expect(countCall?.[1]).toEqual([tenantId, [11, 12], 7]);
    const insertCall = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO hr_document_export_jobs'),
    );
    expect(JSON.parse(insertCall?.[1][3])).toEqual({
      document_type: 'ALL',
      authorized_dept_ids: [11, 12],
    });
    expect(exportQueue.add).toHaveBeenCalledWith(
      'export',
      expect.objectContaining({
        filters: {
          document_type: 'ALL',
          authorized_dept_ids: [11, 12],
        },
      }),
    );
  });

  it('rejects a selected department outside the current REPORTS scope before counting or queueing', async () => {
    const { service, query, exportQueue } = makeService(
      [{ document_id: 'foreign-document' }],
      undefined,
      { can_view: true, entity_scope: [7], department_scope: [11] },
    );

    await expect(
      service.createExportJob(tenantId, 7, 'requester-id', {
        document_type: 'ALL',
        dept_id: 12,
      }),
    ).rejects.toThrow('outside your REPORTS department scope');
    expect(query.mock.calls.some(([sql]) => sql.includes('COUNT(*)::int AS cnt'))).toBe(false);
    expect(exportQueue.add).not.toHaveBeenCalled();
  });

  it('denies status and download after a REPORTS department restriction narrows', async () => {
    const { service } = makeService([], {
      job_id: jobId,
      status: 'COMPLETED',
      file_key: `${tenantId}/exports/${jobId}/archive.zip`,
      file_name: 'archive.zip',
      filters: { document_type: 'ALL', authorized_dept_ids: [11, 12] },
      current_department_scope: [11],
    });
    const res = { setHeader: jest.fn() };

    await expect(service.getExportJob(tenantId, jobId, 'requester-id'))
      .rejects.toThrow('no longer accessible');
    await expect(
      service.pipeExportDownload(tenantId, jobId, 'requester-id', res as never),
    ).rejects.toThrow('no longer accessible');
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('denies legacy all-department archive access when the requester becomes scoped', async () => {
    const { service } = makeService([], {
      status: 'COMPLETED',
      filters: { document_type: 'ALL' },
      current_department_scope: [11],
    });
    await expect(service.getExportJob(tenantId, jobId, 'requester-id'))
      .rejects.toThrow('no longer accessible');
  });

  it('keeps a single-department archive accessible while that department remains allowed', async () => {
    const { service } = makeService([], {
      status: 'COMPLETED',
      file_key: `${tenantId}/exports/${jobId}/archive.zip`,
      filters: { document_type: 'ALL', dept_id: 11, authorized_dept_ids: [11] },
      current_department_scope: [11, 12],
    });
    await expect(service.getExportJob(tenantId, jobId, 'requester-id'))
      .resolves.toMatchObject({ status: 'COMPLETED' });
  });

  it('uses the persisted department snapshot rather than a broad queued payload', async () => {
    const tenantRoot = join(tempRoot, tenantId);
    mkdirSync(tenantRoot, { recursive: true });
    const available = join(tenantRoot, 'available.pdf');
    writeFileSync(available, 'scoped document');
    const { service, query, job } = makeService(
      [{
        document_id: 'scoped-id',
        file_url: available,
        file_name: 'available.pdf',
        document_type: 'PAN',
        employee_name: 'Employee One',
        employee_id: 'E001',
      }],
      {
        filters: { document_type: 'ALL', authorized_dept_ids: [11] },
        current_department_scope: [11],
      },
    );

    await service.runExport(job);
    const workerCall = query.mock.calls.find(([sql]) =>
      sql.includes('ORDER BY u.name'),
    );
    expect(workerCall?.[0]).toContain('u.dept_id = ANY($2::int[])');
    expect(workerCall?.[1]).toEqual([tenantId, [11], 7]);
  });

  it('fails a queued export before reading files after scope revocation', async () => {
    const { service, query, job } = makeService(
      [{ document_id: 'private-id' }],
      {
        filters: { document_type: 'ALL', authorized_dept_ids: [11, 12] },
        current_department_scope: [11],
      },
    );
    await expect(service.runExport(job)).rejects.toThrow('no longer accessible');
    expect(query.mock.calls.some(([sql]) => sql.includes('ORDER BY u.name'))).toBe(false);
  });
});
