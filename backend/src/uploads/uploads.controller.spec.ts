import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import { isPathWithin } from '../storage/disk-file-path';
import { ObjectStorageService } from '../storage/object-storage.service';
import { UploadsController } from './uploads.controller';

jest.mock('uuid', () => ({
  v4: () =>
    jest
      .requireActual<typeof import('node:crypto')>('node:crypto')
      .randomUUID(),
}));

describe('authenticated local uploads', () => {
  let fixtureRoot: string;
  let root: string;
  let previousUploadPath: string | undefined;
  let controller: UploadsController;
  const request = { user: { tenant_id: 'tenant-a' } };

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'falcon-upload-controller-'));
    root = join(fixtureRoot, 'uploads');
    previousUploadPath = process.env.UPLOAD_PATH;
    process.env.UPLOAD_PATH = root;
    controller = new UploadsController(
      new ObjectStorageService({
        get: (key: string, fallback?: string) =>
          key === 'S3_ENDPOINT' ? '' : fallback,
      } as ConfigService),
    );
  });

  afterEach(() => {
    if (previousUploadPath == null) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = previousUploadPath;
    if (!isPathWithin(tmpdir(), fixtureRoot))
      throw new Error('Invalid fixture root');
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  function response() {
    const headers: Record<string, unknown> = {};
    const output = Object.assign(new PassThrough(), {
      setHeader: (name: string, value: unknown) => {
        headers[name] = value;
      },
    });
    return { output, headers, res: output as unknown as Response };
  }

  async function contents(output: PassThrough) {
    const chunks: Buffer[] = [];
    for await (const chunk of output) chunks.push(Buffer.from(chunk as Buffer));
    return Buffer.concat(chunks);
  }

  it('keeps the legacy upload response and streams both disk keys and paths', async () => {
    const bytes = Buffer.from('%PDF-1.4 upload fixture');
    const file = {
      originalname: 'proof.pdf',
      mimetype: 'application/pdf',
      size: bytes.length,
      buffer: bytes,
    } as Express.Multer.File;
    const uploaded = await controller.uploadSingle(file, request);
    expect(uploaded.storage).toBe('disk');
    expect(uploaded.url).toMatch(
      /^\/uploads\/tenant-a\/\d{4}\/\d{2}\/.+\.pdf$/,
    );
    expect(uploaded.path).toBe(
      `${root}/${uploaded.url.slice('/uploads/'.length)}`,
    );

    for (const filePath of [uploaded.url, uploaded.path]) {
      const target = response();
      await controller.downloadFile(filePath!, '', request, target.res);
      expect(await contents(target.output)).toEqual(bytes);
      expect(target.headers['Content-Type']).toBe('application/pdf');
    }
    const target = response();
    await controller.downloadFile(
      '',
      uploaded.url.slice('/uploads/'.length),
      request,
      target.res,
    );
    expect(await contents(target.output)).toEqual(bytes);
  });

  it('requires tenant authentication before uploads and downloads', async () => {
    const file = {
      originalname: 'proof.pdf',
      buffer: Buffer.from('x'),
    } as Express.Multer.File;
    await expect(controller.uploadSingle(file, {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      controller.uploadMultiple([file], { user: {} }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      controller.downloadFile(
        '',
        'tenant-a/proof.pdf',
        { user: {} },
        response().res,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects other tenants, tenant-prefix siblings and traversal', async () => {
    for (const tenant of ['tenant-b', 'tenant-ab']) {
      mkdirSync(join(root, tenant), { recursive: true });
      writeFileSync(join(root, tenant, 'proof.pdf'), 'private document');
      await expect(
        controller.downloadFile(
          join(root, tenant, 'proof.pdf'),
          '',
          request,
          response().res,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        controller.downloadFile(
          '',
          `${tenant}/proof.pdf`,
          request,
          response().res,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    await expect(
      controller.downloadFile(
        '',
        'tenant-a/../tenant-b/proof.pdf',
        request,
        response().res,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects repeated query parameters instead of treating arrays as paths or keys', async () => {
    const repeated = [
      'tenant-a/proof.pdf',
      'tenant-b/proof.pdf',
    ] as unknown as string;
    await expect(
      controller.downloadFile('', repeated, request, response().res),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.downloadFile(repeated, '', request, response().res),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
