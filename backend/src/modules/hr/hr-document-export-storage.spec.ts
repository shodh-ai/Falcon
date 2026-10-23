import { NotFoundException } from '@nestjs/common';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Response } from 'express';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { HrDocumentExportService } from './hr-document-export.service';

jest.mock('archiver', () => ({ ZipArchive: jest.fn() }));

describe('HR export download storage availability', () => {
  const originalUploadPath = process.env.UPLOAD_PATH;
  let fixtureRoot: string;
  const query = jest.fn<Promise<unknown[]>, [string, unknown[]]>();
  const presign = jest.fn();
  const s3Download = jest.fn();
  const enabled = jest.fn();
  let service: HrDocumentExportService;

  beforeAll(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'falcon-hr-export-'));
    process.env.UPLOAD_PATH = join(fixtureRoot, 'uploads');
    mkdirSync(join(process.env.UPLOAD_PATH, 'tenant-a', 'exports'), {
      recursive: true,
    });
    writeFileSync(
      join(process.env.UPLOAD_PATH, 'tenant-a', 'exports', 'proof.zip'),
      'isolated archive fixture',
    );
  });

  beforeEach(() => {
    query.mockReset();
    presign.mockReset();
    s3Download.mockReset();
    enabled.mockReturnValue(false);
    const storage = {
      isEnabled: enabled,
      getPresignedDownloadUrl: presign,
      getDownloadStream: s3Download,
    } as unknown as ObjectStorageService;
    service = new HrDocumentExportService(
      { query } as never,
      {} as never,
      storage,
      {} as never,
    );
  });

  afterAll(() => {
    if (originalUploadPath === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = originalUploadPath;
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  function job(key: string) {
    query.mockResolvedValue([
      {
        job_id: 'job-a',
        status: 'COMPLETED',
        file_key: key,
        file_name: 'proof.zip',
      },
    ]);
  }

  it('advertises an authenticated route only for an existing tenant export', async () => {
    job('tenant-a/exports/proof.zip');
    await expect(
      service.getExportJob('tenant-a', 'job-a', 'hr-a'),
    ).resolves.toMatchObject({
      download_url: '/api/hr/documents/export-jobs/job-a/download',
    });
    expect(query.mock.calls[0][1]).toEqual(['job-a', 'tenant-a', 'hr-a']);
    expect(presign).not.toHaveBeenCalled();
  });

  it.each([
    'tenant-a/exports/missing.zip',
    's3://old/tenant-a/proof.zip',
    'tenant-b/exports/proof.zip',
  ])(
    'does not advertise an unavailable or wrong-tenant disk export %s',
    async (key) => {
      job(key);
      await expect(
        service.getExportJob('tenant-a', 'job-a', 'hr-a'),
      ).resolves.toMatchObject({ download_url: null });
    },
  );

  it('does not sign or stream a cross-tenant export key', async () => {
    enabled.mockReturnValue(true);
    job('tenant-b/exports/proof.zip');
    await expect(
      service.getExportJob('tenant-a', 'job-a', 'hr-a'),
    ).resolves.toMatchObject({ download_url: null });
    await expect(
      service.pipeExportDownload('tenant-a', 'job-a', 'hr-a', {} as Response),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(presign).not.toHaveBeenCalled();
    expect(s3Download).not.toHaveBeenCalled();
  });
});
