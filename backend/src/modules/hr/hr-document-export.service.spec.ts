import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
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
        const stream = value as { on: (event: string, fn: () => void) => void; destroy: () => void };
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

  function makeService(documents: Array<Record<string, unknown>>) {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('ORDER BY u.name')) return Promise.resolve(documents);
      return Promise.resolve([]);
    });
    const notify = { exportReady: jest.fn(), exportFailed: jest.fn() };
    const storage = {
      isEnabled: jest.fn().mockReturnValue(false),
      getBucketName: jest.fn().mockReturnValue('falcon-uploads'),
    };
    const service = new HrDocumentExportService(
      { query } as never, {} as never, storage as never, notify as never,
    );
    const job = {
      jobId, tenantId, entityId: 7, requestedBy: 'requester-id',
      filters: { document_type: 'ALL' as const },
    };
    return { service, query, notify, job };
  }

  it('produces a ZIP and named missing-file manifest when some documents remain readable', async () => {
    const tenantRoot = join(tempRoot, tenantId);
    mkdirSync(tenantRoot, { recursive: true });
    const available = join(tenantRoot, 'available.pdf');
    writeFileSync(available, 'sample document');
    const { service, query, notify, job } = makeService([
      {
        document_id: 'available-id', file_url: available,
        file_name: 'available.pdf', document_type: 'DEGREE',
        employee_name: 'Employee One', employee_id: 'E001',
      },
      {
        document_id: 'missing-id', file_url: join(tenantRoot, 'missing.pdf'),
        file_name: 'missing.pdf', document_type: 'PAN',
        employee_name: 'Employee Two', employee_id: 'E002',
      },
    ]);

    await expect(service.runExport(job)).resolves.toMatchObject({
      document_count: 1, skipped_count: 1,
    });
    const completed = query.mock.calls.find(([sql]) =>
      sql.includes("status = 'COMPLETED'"),
    );
    expect(completed?.[1][3]).toContain('1 of 2 matched document(s)');
    const zipPath = join(tempRoot, tenantId, 'exports', jobId, 'All_ALL_Export.zip');
    expect(readFileSync(zipPath).subarray(0, 2).toString()).toBe('PK');
    expect(notify.exportReady).toHaveBeenCalledTimes(1);
    expect(notify.exportFailed).not.toHaveBeenCalled();
  });

  it('reports exact unavailable document IDs when no files can be read', async () => {
    const { service, query, notify, job } = makeService([{
      document_id: 'missing-id', file_url: join(tempRoot, 'missing.pdf'),
      file_name: 'missing.pdf', document_type: 'PAN',
      employee_name: 'Employee Two', employee_id: 'E002',
    }]);
    await expect(service.runExport(job)).rejects.toThrow('missing-id');
    const failed = query.mock.calls.find(([sql]) =>
      sql.includes("status = 'FAILED'"),
    );
    expect(failed?.[1][1]).toContain('Check the source uploads or S3/MinIO object keys');
    expect(notify.exportFailed).toHaveBeenCalledTimes(1);
  });

  it('skips an existing file outside the export tenant', async () => {
    const foreignPath = join(tempRoot, 'other-tenant', 'private.pdf');
    mkdirSync(join(tempRoot, 'other-tenant'), { recursive: true });
    writeFileSync(foreignPath, 'private data');
    const { service, job } = makeService([{
      document_id: 'foreign-id', file_url: foreignPath,
      file_name: 'private.pdf', document_type: 'PAN',
      employee_name: 'Employee Two', employee_id: 'E002',
    }]);
    await expect(service.runExport(job)).rejects.toThrow('foreign-id');
  });
});
