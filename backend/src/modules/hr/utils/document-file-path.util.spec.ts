import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  openDocumentReadStream,
  parseTenantStorageKey,
  resolveDocumentDiskPath,
} from './document-file-path.util';

describe('tenant-scoped HR document references', () => {
  const tenantId = 'tenant-a';
  let uploadPath: string;
  let previousUploadPath: string | undefined;

  beforeEach(() => {
    uploadPath = mkdtempSync(join(tmpdir(), 'falcon-hr-document-'));
    previousUploadPath = process.env.UPLOAD_PATH;
    process.env.UPLOAD_PATH = uploadPath;
  });

  afterEach(() => {
    if (previousUploadPath === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = previousUploadPath;
    rmSync(uploadPath, { recursive: true, force: true });
  });

  it('accepts only keys under the tenant in the configured bucket', () => {
    expect(
      parseTenantStorageKey(
        's3://falcon-uploads/tenant-a/2026/10/file.pdf',
        tenantId,
        'falcon-uploads',
      ),
    ).toBe('tenant-a/2026/10/file.pdf');
    expect(
      parseTenantStorageKey(
        '/api/uploads/download?key=tenant-a%2F2026%2F10%2Ffile.pdf',
        tenantId,
      ),
    ).toBe('tenant-a/2026/10/file.pdf');
    expect(
      parseTenantStorageKey(
        's3://other-bucket/tenant-a/file.pdf',
        tenantId,
        'falcon-uploads',
      ),
    ).toBeNull();
    expect(
      parseTenantStorageKey(
        's3://falcon-uploads/tenant-b/file.pdf',
        tenantId,
        'falcon-uploads',
      ),
    ).toBeNull();
    expect(
      parseTenantStorageKey(
        's3://falcon-uploads/tenant-a/../tenant-b/file.pdf',
        tenantId,
        'falcon-uploads',
      ),
    ).toBeNull();
    expect(
      parseTenantStorageKey('https://elsewhere.example/file.pdf', tenantId),
    ).toBeNull();
    expect(
      parseTenantStorageKey(
        'https://evil.example/api/uploads/download?key=tenant-a%2Ffile.pdf',
        tenantId,
      ),
    ).toBeNull();
    expect(
      parseTenantStorageKey(
        '//evil.example/api/uploads/download?key=tenant-a%2Ffile.pdf',
        tenantId,
      ),
    ).toBeNull();
  });

  it('reads normal and historical absolute paths only within the tenant upload root', () => {
    const tenantFolder = join(uploadPath, tenantId);
    const otherFolder = join(uploadPath, 'tenant-b');
    mkdirSync(tenantFolder);
    mkdirSync(otherFolder);
    const ownFile = join(tenantFolder, 'file.pdf');
    const foreignFile = join(otherFolder, 'file.pdf');
    writeFileSync(ownFile, 'own');
    writeFileSync(foreignFile, 'foreign');

    expect(
      resolveDocumentDiskPath('/uploads/tenant-a/file.pdf', tenantId),
    ).toBe(realpathSync(ownFile));
    expect(resolveDocumentDiskPath(ownFile, tenantId)).toBe(
      realpathSync(ownFile),
    );
    expect(
      resolveDocumentDiskPath('/uploads/tenant-b/file.pdf', tenantId),
    ).toBeNull();
    expect(resolveDocumentDiskPath(foreignFile, tenantId)).toBeNull();
    expect(resolveDocumentDiskPath('/etc/passwd', tenantId)).toBeNull();
  });

  it('does not follow tenant-local symlinks out of the tenant root', () => {
    const tenantFolder = join(uploadPath, tenantId);
    const otherFolder = join(uploadPath, 'tenant-b');
    mkdirSync(tenantFolder);
    mkdirSync(otherFolder);
    const foreignFile = join(otherFolder, 'private.pdf');
    writeFileSync(foreignFile, 'foreign');
    symlinkSync(foreignFile, join(tenantFolder, 'alias.pdf'));
    expect(
      resolveDocumentDiskPath('/uploads/tenant-a/alias.pdf', tenantId),
    ).toBeNull();
  });

  it('never asks object storage for a different tenant key', async () => {
    const storage = {
      getBucketName: () => 'falcon-uploads',
      isEnabled: () => true,
      getDownloadStream: jest.fn(),
    };
    await expect(
      openDocumentReadStream(
        's3://falcon-uploads/tenant-b/private.pdf',
        storage as never,
        tenantId,
      ),
    ).resolves.toBeNull();
    expect(storage.getDownloadStream).not.toHaveBeenCalled();
  });
});
