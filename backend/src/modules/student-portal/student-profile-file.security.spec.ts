import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Readable } from 'stream';
import { resolve } from 'path';
import { createReadStream, existsSync, realpathSync } from 'fs';
import { StudentPortalService } from './student-portal.service';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'id') }));
jest.mock('fs', () => ({
  ...jest.requireActual<typeof import('fs')>('fs'),
  createReadStream: jest.fn(),
  existsSync: jest.fn(),
  realpathSync: jest.fn(),
}));

const tenantId = 'tenant-a';
const userId = 'student-a';
const storage = {
  isEnabled: jest.fn().mockReturnValue(true),
  getDownloadStream: jest.fn(),
  upload: jest.fn(),
};

function makeService(query: jest.Mock) {
  const unused = {} as never;
  return new StudentPortalService(
    { query } as never,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    storage as never,
    unused,
    unused,
    unused,
    unused,
  );
}

describe('student profile photo file access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.isEnabled.mockReturnValue(true);
    storage.getDownloadStream.mockResolvedValue(Readable.from('image'));
  });

  it.each([
    resolve('.env'),
    '/uploads/tenant-a/students/student-b/photo.jpg',
    'https://example.test/photo.jpg',
    'data:image/png;base64,abc',
    's3://bucket/tenant-a/2026/10/photo.jpg',
  ])(
    'rejects direct photo path PATCH %s before touching persistence or storage',
    async (photo) => {
      const query = jest.fn();
      await expect(
        makeService(query).updateProfile(tenantId, userId, {
          profile_photo_url: photo,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
      expect(storage.isEnabled).not.toHaveBeenCalled();
      expect(storage.upload).not.toHaveBeenCalled();
      expect(storage.getDownloadStream).not.toHaveBeenCalled();
    },
  );

  it.each([
    resolve('.env'),
    resolve('../outside/photo.jpg'),
    '/uploads/tenant-a/students/student-b/photo.jpg',
    '/uploads/tenant-b/students/student-a/photo.jpg',
    'https://example.test/photo.jpg',
    '/uploads/tenant-a/students/student-a/../../secret.jpg',
    's3://bucket/tenant-a/2026/10/unowned.jpg',
  ])(
    'denies an unsafe or unowned legacy profile reference %s',
    async (reference) => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ profile_photo_url: reference }]);
      await expect(
        makeService(query).openProfilePhotoStream(tenantId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(storage.getDownloadStream).not.toHaveBeenCalled();
      expect(storage.isEnabled).not.toHaveBeenCalled();
      expect(createReadStream).not.toHaveBeenCalled();
    },
  );

  it.each([
    resolve('.env'),
    '/uploads/tenant-b/2026/10/photo.jpg',
    'https://example.test/photo.jpg',
  ])(
    'denies an out-of-storage PHOTO document reference %s',
    async (reference) => {
      const query = jest.fn().mockResolvedValueOnce([{ file_path: reference }]);
      await expect(
        makeService(query).openProfilePhotoStream(tenantId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(storage.getDownloadStream).not.toHaveBeenCalled();
      expect(createReadStream).not.toHaveBeenCalled();
    },
  );

  it('allows a server-owned PHOTO document in the authenticated tenant', async () => {
    const key = `${tenantId}/2026/10/owned-photo.jpg`;
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ file_path: `s3://configured-bucket/${key}` }]);
    const result = await makeService(query).openProfilePhotoStream(
      tenantId,
      userId,
    );
    expect(storage.getDownloadStream).toHaveBeenCalledWith(key);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $1 AND student_user_id = $2'),
      [tenantId, userId],
    );
    expect(result.filePath).toBe(key);
    expect(createReadStream).not.toHaveBeenCalled();
  });

  it('allows a legacy photo only under the authenticated student prefix', async () => {
    const key = `${tenantId}/students/${userId}/photo.jpg`;
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ profile_photo_url: `/uploads/${key}` }]);
    await makeService(query).openProfilePhotoStream(tenantId, userId);
    expect(storage.getDownloadStream).toHaveBeenCalledWith(key);
  });

  it('opens a valid owned disk photo only inside the upload root', async () => {
    storage.isEnabled.mockReturnValue(false);
    jest.mocked(existsSync).mockReturnValue(true);
    jest.mocked(realpathSync).mockImplementation((path) => String(path));
    const key = `${tenantId}/2026/10/owned-photo.jpg`;
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ file_path: `/uploads/${key}` }]);
    await makeService(query).openProfilePhotoStream(tenantId, userId);
    expect(createReadStream).toHaveBeenCalledWith(
      resolve(process.env.UPLOAD_PATH || './uploads', key),
    );
    expect(storage.getDownloadStream).not.toHaveBeenCalled();
  });

  it('denies an owned disk reference when a symlink resolves outside the upload root', async () => {
    storage.isEnabled.mockReturnValue(false);
    jest.mocked(existsSync).mockReturnValue(true);
    const root = resolve(process.env.UPLOAD_PATH || './uploads');
    jest
      .mocked(realpathSync)
      .mockImplementation((path) =>
        String(path) === root ? root : resolve('.env'),
      );
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { file_path: `/uploads/${tenantId}/2026/10/owned-photo.jpg` },
      ]);
    await expect(
      makeService(query).openProfilePhotoStream(tenantId, userId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(createReadStream).not.toHaveBeenCalled();
  });

  it.each(['file', 'tenant directory'])(
    'denies a %s symlink into another tenant folder',
    async (symlink) => {
      storage.isEnabled.mockReturnValue(false);
      jest.mocked(existsSync).mockReturnValue(true);
      const root = resolve(process.env.UPLOAD_PATH || './uploads');
      const ownTenantRoot = resolve(root, tenantId);
      jest.mocked(realpathSync).mockImplementation((path) => {
        const value = String(path);
        if (value === root) return root;
        if (value === ownTenantRoot)
          return symlink === 'file' ? ownTenantRoot : resolve(root, 'tenant-b');
        return resolve(root, 'tenant-b/2026/10/photo.jpg');
      });
      const query = jest
        .fn()
        .mockResolvedValueOnce([
          { file_path: `/uploads/${tenantId}/2026/10/photo.jpg` },
        ]);
      await expect(
        makeService(query).openProfilePhotoStream(tenantId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(createReadStream).not.toHaveBeenCalled();
    },
  );
});
