import { BadRequestException } from '@nestjs/common';
import { CourseLmsService } from './course-lms.service';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

describe('CourseLmsService unit deletion', () => {
  function service(materialCount: number) {
    const mod = {
      module_id: 'module-id',
      tenant_id: 'tenant-id',
      faculty_user_id: 'faculty-id',
      course_id: 'course-id',
    };
    const modules = {
      findOne: jest.fn().mockResolvedValue(mod),
      remove: jest.fn().mockResolvedValue(mod),
    };
    const materials = {
      count: jest.fn().mockResolvedValue(materialCount),
    };
    const target = new CourseLmsService(
      modules as any,
      materials as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { target, modules, materials };
  }

  it('deletes an empty unit owned by the faculty member', async () => {
    const { target, modules } = service(0);

    await expect(
      target.deleteModule('faculty-id', 'tenant-id', 'module-id'),
    ).resolves.toEqual({ deleted: true, module_id: 'module-id' });
    expect(modules.remove).toHaveBeenCalledTimes(1);
  });

  it('requires files to be deleted before the unit', async () => {
    const { target, modules } = service(2);

    await expect(
      target.deleteModule('faculty-id', 'tenant-id', 'module-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(modules.remove).not.toHaveBeenCalled();
  });
});
