import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { HrDocumentVaultService } from './hr-document-vault.service';
import {
  openDocumentReadStream,
  resolveDocumentDiskPath,
} from './utils/document-file-path.util';

describe('authenticated HR document downloads in local disk mode', () => {
  const originalUploadPath = process.env.UPLOAD_PATH;
  let fixtureRoot: string;
  let ownFile: string;
  const query = jest.fn<Promise<unknown[]>, [string, unknown[]]>();
  const presign = jest.fn();
  const s3Download = jest.fn();
  const enabled = jest.fn();
  let storage: ObjectStorageService;
  let vault: HrDocumentVaultService;

  beforeAll(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'falcon-hr-disk-'));
    process.env.UPLOAD_PATH = join(fixtureRoot, 'uploads');
    mkdirSync(join(process.env.UPLOAD_PATH, 'tenant-a'), { recursive: true });
    mkdirSync(join(process.env.UPLOAD_PATH, 'tenant-b'), { recursive: true });
    ownFile = join(process.env.UPLOAD_PATH, 'tenant-a', 'document.pdf');
    writeFileSync(ownFile, 'isolated document fixture');
    writeFileSync(
      join(process.env.UPLOAD_PATH, 'tenant-b', 'other.pdf'),
      'other tenant',
    );
    writeFileSync(join(fixtureRoot, 'outside.pdf'), 'outside storage');
  });

  beforeEach(() => {
    query.mockReset();
    presign.mockReset();
    s3Download.mockReset();
    enabled.mockReturnValue(false);
    storage = {
      isEnabled: enabled,
      getPresignedDownloadUrl: presign,
      getDownloadStream: s3Download,
    } as unknown as ObjectStorageService;
    vault = new HrDocumentVaultService({ query } as never, storage);
  });

  afterAll(() => {
    if (originalUploadPath === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = originalUploadPath;
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  function document(fileUrl: string, userId = 'faculty-a') {
    query.mockResolvedValue([
      { user_id: userId, file_url: fileUrl, file_name: 'document.pdf' },
    ]);
  }

  it.each(['/uploads/tenant-a/document.pdf', 'tenant-a/document.pdf'])(
    'uses a protected vault route for disk reference %s',
    async (fileUrl) => {
      document(fileUrl);
      await expect(
        vault.getSecureDownloadUrl('tenant-a', 'doc-a', 'faculty-a', false),
      ).resolves.toMatchObject({
        url: '/api/hr/documents/doc-a/file',
        delivery: 'authenticated',
      });
      expect(presign).not.toHaveBeenCalled();
      expect(s3Download).not.toHaveBeenCalled();
    },
  );

  it('preserves existing absolute paths inside the document tenant folder', () => {
    expect(resolveDocumentDiskPath(ownFile, 'tenant-a')).toBe(
      realpathSync(ownFile),
    );
  });

  it('reads actual local bytes without using S3', async () => {
    const stream = await openDocumentReadStream(
      '/uploads/tenant-a/document.pdf',
      storage,
      'tenant-a',
    );
    expect(stream).toBeInstanceOf(Readable);
    const chunks: Buffer[] = [];
    for await (const chunk of stream!)
      chunks.push(Buffer.from(chunk as Buffer));
    expect(Buffer.concat(chunks).toString()).toBe('isolated document fixture');
    expect(s3Download).not.toHaveBeenCalled();
  });

  it('keeps owner checks before disclosing a file link', async () => {
    document('/uploads/tenant-a/document.pdf', 'someone-else');
    await expect(
      vault.getSecureDownloadUrl('tenant-a', 'doc-a', 'faculty-a', false),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the existing HR permission to inspect a document in its tenant', async () => {
    document('/uploads/tenant-a/document.pdf', 'someone-else');
    await expect(
      vault.getSecureDownloadUrl('tenant-a', 'doc-a', 'hr-a', true),
    ).resolves.toMatchObject({ delivery: 'authenticated' });
    expect(query.mock.calls[0][1]).toEqual(['doc-a', 'tenant-a']);
  });

  it.each([
    '/uploads/tenant-b/other.pdf',
    '/uploads/tenant-a/../tenant-b/other.pdf',
    's3://old-bucket/tenant-a/document.pdf',
    '/uploads/tenant-a/missing.pdf',
  ])('does not advertise an available disk file for %s', async (fileUrl) => {
    document(fileUrl);
    await expect(
      vault.getSecureDownloadUrl('tenant-a', 'doc-a', 'faculty-a', false),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses existing files outside the configured upload folder', async () => {
    document(join(fixtureRoot, 'outside.pdf'));
    await expect(
      vault.getSecureDownloadUrl('tenant-a', 'doc-a', 'faculty-a', false),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      resolveDocumentDiskPath(join(fixtureRoot, 'outside.pdf')),
    ).toBeNull();
  });

  it('refuses cross-tenant S3 keys before signing or streaming', async () => {
    enabled.mockReturnValue(true);
    document('s3://bucket/tenant-b/other.pdf');
    await expect(
      vault.getSecureDownloadUrl('tenant-a', 'doc-a', 'faculty-a', false),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      openDocumentReadStream(
        's3://bucket/tenant-b/other.pdf',
        storage,
        'tenant-a',
      ),
    ).resolves.toBeNull();
    expect(presign).not.toHaveBeenCalled();
    expect(s3Download).not.toHaveBeenCalled();
  });
});
