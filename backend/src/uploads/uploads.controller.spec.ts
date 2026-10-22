import 'reflect-metadata';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { Response } from 'express';
import * as fs from 'fs';
import { resolve } from 'path';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { SHARED_UPLOAD_ROLES } from './upload-file-access';

jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000001' }));
jest.mock('fs', () => ({
  ...jest.requireActual<typeof fs>('fs'),
  existsSync: jest.fn(),
  createReadStream: jest.fn(),
}));

describe('Shared uploads Student isolation', () => {
  const root = resolve('uploads');
  const tenant = 'tenant-a';
  const key = `${tenant}/2026/10/document.pdf`;
  const user = { tenant_id: tenant, user_id: 'student-a', roles: ['Student'] };
  const query = jest.fn();
  const pipe = jest.fn();
  const storage = {
    isEnabled: jest.fn(),
    getBucketName: jest.fn(() => 'bucket'),
    getDownloadStream: jest.fn(),
    buildKey: jest.fn(),
    upload: jest.fn(),
  };
  const setHeader = jest.fn();
  const res = { setHeader } as unknown as Response;
  let controller: UploadsController;

  beforeEach(() => {
    jest.resetAllMocks();
    query.mockResolvedValue([{ file_reference: `/uploads/${key}` }]);
    storage.isEnabled.mockReturnValue(true);
    storage.getBucketName.mockReturnValue('bucket');
    storage.getDownloadStream.mockResolvedValue({ pipe });
    controller = new UploadsController(
      storage as unknown as ObjectStorageService,
      new UploadsService(new ConfigService({ UPLOAD_PATH: root }), {
        query,
      } as unknown as DataSource),
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('streams an owned S3 reference from the configured storage after authorization', async () => {
    await controller.downloadFile(`s3://bucket/${key}`, '', { user }, res);
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      tenant,
      'student-a',
    ]);
    expect(storage.getDownloadStream).toHaveBeenCalledWith(key);
    expect(pipe).toHaveBeenCalledWith(res);
  });

  it('blocks a same-tenant Student B file before any storage read or headers', async () => {
    query.mockResolvedValue([]);
    await expect(
      controller.downloadFile('', key, { user }, res),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.getDownloadStream).not.toHaveBeenCalled();
    expect(setHeader).not.toHaveBeenCalled();
  });

  it.each(['s3', 'disk'])(
    'uses safe content types and private no-store headers for %s downloads',
    async (mode) => {
      storage.isEnabled.mockReturnValue(mode === 's3');
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest
        .mocked(fs.createReadStream)
        .mockReturnValue({ pipe } as unknown as fs.ReadStream);
      const files = [
        ['report.pdf', 'application/pdf'],
        ['photo.jpg', 'image/jpeg'],
        ['photo.JPEG', 'image/jpeg'],
        ['photo.png', 'image/png'],
        ['spoofed.html', 'application/octet-stream'],
      ];
      for (const [filename, contentType] of files) {
        const fileKey = `${tenant}/2026/10/${filename}`;
        query.mockResolvedValue([{ file_reference: `/uploads/${fileKey}` }]);
        setHeader.mockClear();
        await controller.downloadFile(
          mode === 'disk' ? `/uploads/${fileKey}` : '',
          mode === 's3' ? fileKey : '',
          { user },
          res,
        );
        expect(setHeader).toHaveBeenCalledWith('Content-Type', contentType);
        expect(setHeader).toHaveBeenCalledWith(
          'X-Content-Type-Options',
          'nosniff',
        );
        expect(setHeader).toHaveBeenCalledWith(
          'Cache-Control',
          'private, no-store',
        );
        expect(setHeader).toHaveBeenCalledWith(
          'Content-Disposition',
          `inline; filename="${filename}"`,
        );
      }
    },
  );

  it.each([
    'tenant-b/2026/10/document.pdf',
    'tenant-a-other/2026/10/document.pdf',
    'tenant-a/../tenant-b/document.pdf',
  ])('blocks an invalid object key: %s', async (invalid) => {
    await expect(
      controller.downloadFile('', invalid, { user }, res),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).not.toHaveBeenCalled();
    expect(storage.getDownloadStream).not.toHaveBeenCalled();
  });

  it.each([
    resolve(`${root}-other`, tenant, 'document.pdf'),
    resolve(root, `${tenant}-other/document.pdf`),
    '/uploads/tenant-a/../tenant-b/document.pdf',
  ])(
    'blocks disk sibling/traversal even if the file exists: %s',
    async (invalid) => {
      storage.isEnabled.mockReturnValue(false);
      jest.mocked(fs.existsSync).mockReturnValue(true);
      const stream = jest.mocked(fs.createReadStream);
      await expect(
        controller.downloadFile(invalid, '', { user }, res),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(stream).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('streams an owned existing local document and still enforces identity', async () => {
    storage.isEnabled.mockReturnValue(false);
    jest.mocked(fs.existsSync).mockReturnValue(true);
    const stream = jest
      .mocked(fs.createReadStream)
      .mockReturnValue({ pipe } as unknown as fs.ReadStream);
    await controller.downloadFile(`/uploads/${key}`, '', { user }, res);
    expect(stream).toHaveBeenCalledWith(resolve(root, key));
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      tenant,
      'student-a',
    ]);
  });

  it('preserves staff and multihat staff valid file reads without student lookup', async () => {
    await controller.downloadFile(
      '',
      key,
      { user: { ...user, roles: ['Faculty'] } },
      res,
    );
    await controller.downloadFile(
      '',
      key,
      { user: { ...user, roles: ['Student', 'Faculty'] } },
      res,
    );
    await controller.downloadFile(
      '',
      key,
      { user: { ...user, roles: ['Student', 'CampusAdmin'] } },
      res,
    );
    expect(query).not.toHaveBeenCalled();
    expect(storage.getDownloadStream).toHaveBeenCalledTimes(3);
  });

  it('gives Applicant the download role only and keeps POST roles unchanged', () => {
    const method = (name: string): object =>
      Object.getOwnPropertyDescriptor(UploadsController.prototype, name)
        ?.value as object;
    expect(Reflect.getMetadata(ROLES_KEY, UploadsController)).toEqual([
      ...SHARED_UPLOAD_ROLES,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, method('downloadFile'))).toEqual([
      ...SHARED_UPLOAD_ROLES,
      'Applicant',
    ]);
    expect(
      Reflect.getMetadata(ROLES_KEY, method('uploadSingle')),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(ROLES_KEY, method('uploadMultiple')),
    ).toBeUndefined();
  });

  it('uses a server-selected Student upload folder and preserves staff upload keys', async () => {
    storage.buildKey.mockImplementation(
      (tenantId: string, filename: string) => `${tenantId}/2026/10/${filename}`,
    );
    storage.upload.mockImplementation((_tenant: string, storedKey: string) =>
      Promise.resolve({ key: storedKey, url: `s3://bucket/${storedKey}` }),
    );
    const file = {
      originalname: 'file.pdf',
      buffer: Buffer.from('pdf'),
      mimetype: 'application/pdf',
      size: 3,
    } as Express.Multer.File;
    await controller.uploadSingle(file, { user });
    expect(storage.upload).toHaveBeenLastCalledWith(
      tenant,
      expect.stringMatching(/^tenant-a\/students\/student-a\/[a-f\d-]+\.pdf$/),
      file.buffer,
      'application/pdf',
    );
    await controller.uploadSingle(file, {
      user: { ...user, roles: ['Faculty'] },
    });
    expect(storage.upload).toHaveBeenLastCalledWith(
      tenant,
      expect.stringMatching(/^tenant-a\/2026\/10\/[a-f\d-]+\.pdf$/),
      file.buffer,
      'application/pdf',
    );
  });

  it('requires authentication and tenant context before file access', async () => {
    await expect(
      controller.downloadFile('', key, {}, res),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      controller.downloadFile(
        '',
        key,
        { user: { user_id: 'student-a', roles: ['Student'] } },
        res,
      ),
    ).rejects.toThrow('Tenant context required');
    expect(storage.getDownloadStream).not.toHaveBeenCalled();
  });
});
