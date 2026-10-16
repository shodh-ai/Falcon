import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { existsSync, createReadStream } from 'fs';
import { resolve } from 'path';
import { StaffVerificationController } from './student-onboarding.controller';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  createReadStream: jest.fn(),
}));

describe('Staff document preview', () => {
  const actor = { user_id: 'hr', tenant_id: 'tenant-1', role: 'HRAdmin' };
  const onboarding = {
    resolveTenantId: jest.fn().mockResolvedValue('tenant-1'),
    getDocumentPath: jest.fn(),
  };
  const storage = { isEnabled: () => false };
  const controller = new StaffVerificationController(onboarding as never, storage as never, {} as never, {} as never);
  const response = { setHeader: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    onboarding.getDocumentPath.mockResolvedValue(resolve(process.env.UPLOAD_PATH || './uploads', 'tenant-1/photo.jpg'));
  });

  it('reports a missing original as a structured 404 without exposing a disk path', async () => {
    (existsSync as jest.Mock).mockReturnValue(false);
    try {
      await controller.previewDocument({ user: actor }, 'staff-1', 'photo', response as never);
      throw new Error('Expected a missing-file error');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
      const payload = (error as NotFoundException).getResponse();
      expect(payload).toMatchObject({ code: 'DOCUMENT_FILE_UNAVAILABLE', message: expect.stringContaining('original file is missing') });
      expect(JSON.stringify(payload)).not.toContain(resolve('./uploads'));
    }
    expect(createReadStream).not.toHaveBeenCalled();
  });

  it('checks tenant, target user and campus scope before touching any file', async () => {
    onboarding.getDocumentPath.mockRejectedValue(new ForbiddenException('Outside assigned campus'));
    await expect(controller.previewDocument({ user: actor }, 'staff-1', 'highest-degree', response as never))
      .rejects.toThrow('Outside assigned campus');
    expect(onboarding.getDocumentPath).toHaveBeenCalledWith('tenant-1', 'staff-1', 'HIGHEST_DEGREE', actor, 'staff');
    expect(existsSync).not.toHaveBeenCalled();
  });

  it('rejects a sibling directory whose prefix resembles the uploads directory', async () => {
    const root = resolve(process.env.UPLOAD_PATH || './uploads');
    onboarding.getDocumentPath.mockResolvedValue(`${root}-private/secret.jpg`);
    (existsSync as jest.Mock).mockReturnValue(true);
    await expect(controller.previewDocument({ user: actor }, 'staff-1', 'PHOTO', response as never))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(createReadStream).not.toHaveBeenCalled();
  });

  it('streams an existing image with its correct type and no-store headers', async () => {
    (existsSync as jest.Mock).mockReturnValue(true);
    const pipe = jest.fn().mockReturnValue(response);
    (createReadStream as jest.Mock).mockReturnValue({ pipe });
    await controller.previewDocument({ user: actor }, 'staff-1', 'PHOTO', response as never);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(pipe).toHaveBeenCalledWith(response);
  });
});
