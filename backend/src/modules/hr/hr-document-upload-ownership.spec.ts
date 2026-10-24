import { ForbiddenException } from '@nestjs/common';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { HrDocumentVaultService } from './hr-document-vault.service';

const tenantId = 'tenant-a';
const userId = 'employee-a';
const ownKey = `${tenantId}/2026/10/hr-documents/${userId}/file.pdf`;

function makeService(enabled = true) {
  const query = jest.fn().mockResolvedValue([{ document_id: 'new-doc' }]);
  const service = new HrDocumentVaultService(
    { query } as never,
    {
      isEnabled: () => enabled,
      getBucketName: () => 'falcon-uploads',
    } as never,
  );
  return { service, query };
}

describe('personal HR document registration ownership', () => {
  it('accepts an uploaded private object owned by the authenticated employee', async () => {
    const { service, query } = makeService();
    await service.uploadDocument(
      tenantId,
      7,
      userId,
      userId,
      { document_type: 'PAN', file_url: `s3://falcon-uploads/${ownKey}` },
      { requireUploaderOwnership: true },
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO hr_employee_documents'),
      [
        tenantId,
        7,
        userId,
        'PAN',
        `s3://falcon-uploads/${ownKey}`,
        'file.pdf',
        userId,
        'PENDING',
      ],
    );
  });

  it.each([
    `${tenantId}/2026/10/hr-documents/employee-b/file.pdf`,
    `${tenantId}/2026/10/legacy-without-uploader.pdf`,
  ])(
    'rejects foreign uploader or unbound legacy file references before insertion: %s',
    async (key) => {
      const { service, query } = makeService();
      await expect(
        service.uploadDocument(
          tenantId,
          7,
          userId,
          userId,
          { document_type: 'PAN', file_url: `s3://falcon-uploads/${key}` },
          { requireUploaderOwnership: true },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('preserves authorized HR employee registration of an existing tenant upload', async () => {
    const { service, query } = makeService();
    await service.uploadDocument(
      tenantId,
      7,
      userId,
      'hr-admin',
      {
        document_type: 'HR_LETTER',
        file_url: `s3://falcon-uploads/${tenantId}/2026/10/existing-letter.pdf`,
      },
      { autoVerify: false },
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO hr_employee_documents'),
      expect.arrayContaining([userId, 'hr-admin', 'PENDING']),
    );
  });

  it('verifies the real disk file owner and refuses a symlink to another employee', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'falcon-hr-upload-owner-'));
    const previousUploadPath = process.env.UPLOAD_PATH;
    process.env.UPLOAD_PATH = directory;
    const ownDirectory = join(
      directory,
      tenantId,
      '2026/10/hr-documents',
      userId,
    );
    const foreignDirectory = join(
      directory,
      tenantId,
      '2026/10/hr-documents/employee-b',
    );
    mkdirSync(ownDirectory, { recursive: true });
    mkdirSync(foreignDirectory, { recursive: true });
    writeFileSync(join(ownDirectory, 'file.pdf'), 'own synthetic document');
    writeFileSync(
      join(foreignDirectory, 'file.pdf'),
      'foreign synthetic document',
    );
    symlinkSync(
      join(foreignDirectory, 'file.pdf'),
      join(ownDirectory, 'alias.pdf'),
    );
    try {
      const { service, query } = makeService(false);
      await service.uploadDocument(
        tenantId,
        7,
        userId,
        userId,
        { document_type: 'PAN', file_url: `/uploads/${ownKey}` },
        { requireUploaderOwnership: true },
      );
      query.mockClear();
      await expect(
        service.uploadDocument(
          tenantId,
          7,
          userId,
          userId,
          {
            document_type: 'PAN',
            file_url: `/uploads/${ownKey.replace('file.pdf', 'alias.pdf')}`,
          },
          { requireUploaderOwnership: true },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    } finally {
      if (previousUploadPath === undefined) delete process.env.UPLOAD_PATH;
      else process.env.UPLOAD_PATH = previousUploadPath;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
