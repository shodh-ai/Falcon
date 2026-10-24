import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { HrDocumentVaultService } from './hr-document-vault.service';

describe('HrDocumentVaultService storage boundaries', () => {
  const tenantId = 'tenant-a';
  const userId = 'user-a';
  let uploadPath: string;
  let previousUploadPath: string | undefined;

  beforeEach(() => {
    uploadPath = mkdtempSync(join(tmpdir(), 'falcon-hr-vault-'));
    previousUploadPath = process.env.UPLOAD_PATH;
    process.env.UPLOAD_PATH = uploadPath;
  });

  afterEach(() => {
    if (previousUploadPath === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = previousUploadPath;
    rmSync(uploadPath, { recursive: true, force: true });
  });

  function makeService(fileUrl?: string, enabled = true) {
    const query = jest
      .fn()
      .mockResolvedValue(
        fileUrl
          ? [{ user_id: userId, file_url: fileUrl, file_name: 'document.pdf' }]
          : [{ document_id: 'doc-id' }],
      );
    const storage = {
      getBucketName: jest.fn().mockReturnValue('falcon-uploads'),
      isEnabled: jest.fn().mockReturnValue(enabled),
      getPresignedDownloadUrl: jest
        .fn()
        .mockResolvedValue('https://safe.example/signed'),
      getDownloadStream: jest.fn(),
      assertObjectExists: jest.fn().mockResolvedValue(undefined),
    };
    return {
      service: new HrDocumentVaultService({ query } as never, storage as never),
      query,
      storage,
    };
  }

  it('rejects external files and cross-tenant object keys before writing a row', async () => {
    const { service, query } = makeService();
    for (const fileUrl of [
      '/etc/passwd',
      'https://elsewhere.example/private.pdf',
      'https://evil.example/api/uploads/download?key=tenant-a%2Fprivate.pdf',
      's3://falcon-uploads/tenant-b/2026/10/private.pdf',
      's3://different-bucket/tenant-a/2026/10/private.pdf',
    ]) {
      await expect(
        service.uploadDocument(tenantId, 1, userId, userId, {
          document_type: 'PAN',
          file_url: fileUrl,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('accepts a same-tenant uploaded object and normalizes its storage reference', async () => {
    const { service, query } = makeService();
    await service.uploadDocument(tenantId, 1, userId, userId, {
      document_type: 'PAN',
      file_url: '/api/uploads/download?key=tenant-a%2F2026%2F10%2Ffile.pdf',
      file_name: 'file.pdf',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO hr_employee_documents'),
      expect.arrayContaining(['s3://falcon-uploads/tenant-a/2026/10/file.pdf']),
    );
  });

  it('accepts an existing same-tenant disk upload', async () => {
    const tenantFolder = join(uploadPath, tenantId);
    mkdirSync(tenantFolder);
    writeFileSync(join(tenantFolder, 'file.pdf'), 'document');
    const { service, query } = makeService(undefined, false);
    await service.uploadDocument(tenantId, 1, userId, userId, {
      document_type: 'PAN',
      file_url: '/uploads/tenant-a/file.pdf',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO hr_employee_documents'),
      expect.arrayContaining(['/uploads/tenant-a/file.pdf']),
    );
  });

  it('does not create a document row for a missing or inaccessible object', async () => {
    const { service, query, storage } = makeService();
    storage.assertObjectExists.mockRejectedValue(new Error('NoSuchKey'));
    await expect(service.uploadDocument(tenantId, 1, userId, userId, {
      document_type: 'PAN', file_url: 's3://falcon-uploads/tenant-a/missing.pdf',
    })).rejects.toThrow('Upload it again');
    expect(query).not.toHaveBeenCalled();
  });

  it('resolves a legacy download key to the persisted local file when S3 is disabled', async () => {
    mkdirSync(join(uploadPath, tenantId));
    writeFileSync(join(uploadPath, tenantId, 'file.pdf'), 'document');
    const { service, query, storage } = makeService(undefined, false);
    await service.uploadDocument(tenantId, 1, userId, userId, {
      document_type: 'PAN', file_url: '/api/uploads/download?key=tenant-a%2Ffile.pdf',
    });
    expect(storage.assertObjectExists).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO'), expect.arrayContaining(['/uploads/tenant-a/file.pdf']));
  });

  it('rejects a stale local URL when the tenant upload directory is absent', async () => {
    const { service, query } = makeService(undefined, false);
    await expect(
      service.uploadDocument(tenantId, 1, userId, userId, {
        document_type: 'PAN',
        file_url: '/uploads/tenant-a/missing.pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not return an external URL or file from a legacy unsafe row', async () => {
    const { service, storage } = makeService(
      'https://elsewhere.example/private.pdf',
    );
    await expect(
      service.getSecureDownloadUrl(tenantId, 'doc-id', userId, false),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.getPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('presigns only a same-tenant object in the configured bucket', async () => {
    const { service, storage } = makeService(
      's3://falcon-uploads/tenant-a/file.pdf',
    );
    await expect(
      service.getSecureDownloadUrl(tenantId, 'doc-id', userId, false),
    ).resolves.toMatchObject({ url: 'https://safe.example/signed' });
    expect(storage.getPresignedDownloadUrl).toHaveBeenCalledWith(
      'tenant-a/file.pdf',
      900,
    );
  });
});
