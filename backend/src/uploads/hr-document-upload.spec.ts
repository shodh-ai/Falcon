import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { RolesGuard } from '../common/guards/roles.guard';
import { EXAM_CELL_SELF_SERVICE_ROLES } from '../modules/hr/hr-workforce.constants';
import { UploadsController } from './uploads.controller';
import {
  HR_DOCUMENT_UPLOAD_PURPOSE,
  hrUploadOwner,
  ownedHrUploadName,
} from './hr-document-upload.util';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '11111111-1111-4111-8111-111111111111'),
}));

const tenantId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';
const otherUserId = '20000000-0000-4000-8000-000000000002';
const ownKey = `${tenantId}/2026/10/hr-documents/${userId}/file.pdf`;
const req = {
  user: { tenant_id: tenantId, user_id: userId, role: 'ExamCell' },
};
const file = {
  buffer: Buffer.from('synthetic PDF'),
  originalname: 'proof.pdf',
  mimetype: 'application/pdf',
  size: 13,
} as Express.Multer.File;

function makeController(enabled = true) {
  const pipe = jest.fn();
  const getDownloadStream = jest.fn().mockResolvedValue({ pipe });
  const upload = jest.fn((_: string, key: string) =>
    Promise.resolve({ key, url: `s3://falcon-uploads/${key}` }),
  );
  const controller = new UploadsController(
    {
      isEnabled: () => enabled,
      buildKey: (tenant: string, name: string) => `${tenant}/2026/10/${name}`,
      getBucketName: () => 'falcon-uploads',
      upload,
      getDownloadStream,
    } as never,
    {
      query: jest.fn(),
      canonicalKey: (key: string, scopedTenantId: string) =>
        key.startsWith(`${scopedTenantId}/`) ? key : null,
      assertStudentDownloadAccess: jest.fn(),
      getUploadPath: () =>
        process.env.UPLOAD_PATH ?? '/tmp/falcon-hr-upload-test',
    } as never,
  );
  return { controller, upload, getDownloadStream, pipe };
}

function permits(
  role: string,
  method: 'uploadSingle' | 'uploadMultiple',
): boolean {
  const handler = Reflect.get(UploadsController.prototype, method) as (
    ...args: never[]
  ) => unknown;
  const context = {
    getHandler: () => handler,
    getClass: () => UploadsController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { ...req.user, roles: [role], role } }),
    }),
  } as unknown as ExecutionContext;
  return new RolesGuard(new Reflector()).canActivate(context);
}

describe('private HR uploads', () => {
  it.each(EXAM_CELL_SELF_SERVICE_ROLES)(
    'permits %s single-file attachments without expanding bulk upload access',
    (role) => {
      expect(permits(role, 'uploadSingle')).toBe(true);
      expect(permits(role, 'uploadMultiple')).toBe(role === 'ExamCell');
    },
  );

  it('creates the private namespace from the authenticated employee rather than client metadata', async () => {
    const { controller, upload } = makeController();
    const result = await controller.uploadSingle(
      file,
      req,
      HR_DOCUMENT_UPLOAD_PURPOSE,
    );

    expect(result.url).toContain(`/hr-documents/${userId}/`);
    expect(upload).toHaveBeenCalledWith(
      tenantId,
      expect.stringContaining(`/hr-documents/${userId}/`),
      file.buffer,
      file.mimetype,
    );
    expect(upload).not.toHaveBeenCalledWith(
      tenantId,
      expect.stringContaining(otherUserId),
      expect.anything(),
      expect.anything(),
    );
  });

  it('refuses private HR uploads without an authenticated tenant and owner', async () => {
    const { controller, upload } = makeController();
    await expect(
      controller.uploadSingle(
        file,
        { user: { tenant_id: tenantId } },
        HR_DOCUMENT_UPLOAD_PURPOSE,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(upload).not.toHaveBeenCalled();
  });

  it('keeps ordinary shared uploads outside the private HR namespace', async () => {
    const { controller } = makeController();
    const result = await controller.uploadSingle(file, req);
    expect(result.url).not.toContain('/hr-documents/');
  });

  it('writes a private disk file below the tenant and employee directory', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'falcon-private-hr-upload-'));
    const previousUploadPath = process.env.UPLOAD_PATH;
    process.env.UPLOAD_PATH = directory;
    try {
      const { controller } = makeController(false);
      const result = await controller.uploadSingle(
        file,
        req,
        HR_DOCUMENT_UPLOAD_PURPOSE,
      );
      expect(result.url).toContain(`/hr-documents/${userId}/`);
      const local = result as { path: string };
      expect(existsSync(local.path)).toBe(true);
      expect(readFileSync(local.path)).toEqual(file.buffer);
    } finally {
      if (previousUploadPath === undefined) delete process.env.UPLOAD_PATH;
      else process.env.UPLOAD_PATH = previousUploadPath;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    `${tenantId}/2026/10/hr-documents/${otherUserId}/file.pdf`,
    `30000000-0000-4000-8000-000000000001/2026/10/hr-documents/${userId}/file.pdf`,
  ])(
    'rejects a raw URL for another employee or tenant before opening storage: %s',
    async (key) => {
      const { controller, getDownloadStream } = makeController();
      await expect(
        controller.downloadFile('', key, req, {
          setHeader: jest.fn(),
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(getDownloadStream).not.toHaveBeenCalled();
    },
  );

  it.each(['ExamCell', 'HRAdmin'])(
    'allows a private upload owner to read their own file: %s',
    async (role) => {
      const { controller, getDownloadStream, pipe } = makeController();
      const user = { ...req.user, role };
      const response = { setHeader: jest.fn() };
      await controller.downloadFile('', ownKey, { user }, response as never);
      expect(getDownloadStream).toHaveBeenCalledWith(ownKey);
      expect(pipe).toHaveBeenCalledWith(response);
    },
  );

  it('requires an HR reviewer to use the document record rather than a foreign employee raw key', async () => {
    const { controller, getDownloadStream } = makeController();
    await expect(
      controller.downloadFile(
        '',
        ownKey,
        { user: { ...req.user, user_id: otherUserId, role: 'HRAdmin' } },
        { setHeader: jest.fn() } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(getDownloadStream).not.toHaveBeenCalled();
  });

  it('does not accept traversal or malformed ownership names', () => {
    expect(ownedHrUploadName('../other-user', 'file.pdf')).toBeNull();
    expect(ownedHrUploadName(userId, '../file.pdf')).toBeNull();
    expect(
      hrUploadOwner(`${tenantId}/2026/10/hr-documents/${userId}/../file.pdf`),
    ).toBeNull();
  });

  it('refuses malformed private upload filenames before saving', async () => {
    const { controller, upload } = makeController();
    await expect(
      controller.uploadSingle(
        { ...file, originalname: 'file.pdf?bad' },
        req,
        HR_DOCUMENT_UPLOAD_PURPOSE,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upload).not.toHaveBeenCalled();
  });
});
