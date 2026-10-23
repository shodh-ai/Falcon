import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ObjectStorageService } from './object-storage.service';
import { isPathWithin } from './disk-file-path';

function diskStorage(): ObjectStorageService {
  return new ObjectStorageService({
    get: (key: string, fallback?: string) =>
      key === 'S3_ENDPOINT' ? '' : fallback,
  } as ConfigService);
}

describe('local object storage', () => {
  let fixtureRoot: string;
  let root: string;
  let previousUploadPath: string | undefined;
  let storage: ObjectStorageService;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'falcon-disk-storage-'));
    root = join(fixtureRoot, 'uploads');
    previousUploadPath = process.env.UPLOAD_PATH;
    process.env.UPLOAD_PATH = root;
    storage = diskStorage();
  });

  afterEach(() => {
    if (previousUploadPath == null) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = previousUploadPath;
    if (!isPathWithin(tmpdir(), fixtureRoot))
      throw new Error('Invalid fixture root');
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('round-trips bytes on disk and returns an authenticated download route', async () => {
    const key = storage.buildKey('tenant-a', 'proof.pdf');
    const body = Buffer.from('%PDF-1.4 isolated fixture');
    expect(storage.isEnabled()).toBe(false);
    const stored = await storage.upload(
      'tenant-a',
      key,
      body,
      'application/pdf',
    );
    expect(stored).toEqual({
      key,
      bucket: 'disk',
      url: `/uploads/${key}`,
      size: body.length,
      contentType: 'application/pdf',
    });
    const stream = await storage.getDownloadStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
    expect(Buffer.concat(chunks)).toEqual(body);
    expect(await storage.getPresignedDownloadUrl(key)).toBe(
      `/api/uploads/download?key=${encodeURIComponent(key)}`,
    );
  });

  it.each([
    'tenant-b/proof.pdf',
    '../outside.pdf',
    'tenant-a/../outside.pdf',
    '/tenant-a/proof.pdf',
    'tenant-a/.. /outside.pdf',
    'tenant-a/folder./proof.pdf',
    'tenant-a/folder /proof.pdf',
    'tenant-a/proof.pdf.',
  ])('rejects unsafe upload key %s before writing', async (key) => {
    await expect(
      storage.upload('tenant-a', key, Buffer.from('no'), 'application/pdf'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(existsSync(root)).toBe(false);
  });

  it('rejects a directory symlink before a write can reach another tenant', async () => {
    mkdirSync(join(root, 'tenant-b'), { recursive: true });
    symlinkSync(join(root, 'tenant-b'), join(root, 'tenant-a'), 'junction');
    await expect(
      storage.upload(
        'tenant-a',
        'tenant-a/proof.pdf',
        Buffer.from('no'),
        'application/pdf',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(existsSync(join(root, 'tenant-b', 'proof.pdf'))).toBe(false);
  });

  it('reports missing objects and untrusted download keys as not found', async () => {
    await expect(storage.getDownloadStream('../secret')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      storage.getDownloadStream('tenant-a/missing.pdf'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      storage.getPresignedDownloadUrl('tenant-a/missing.pdf'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
