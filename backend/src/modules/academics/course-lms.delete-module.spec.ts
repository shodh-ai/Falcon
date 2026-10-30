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
    const manager = {
      getRepository: jest.fn((entity: { name: string }) =>
        entity.name === 'CourseModule' ? modules : materials,
      ),
    };
    const dataSource = {
      transaction: jest.fn((run: (value: typeof manager) => unknown) =>
        Promise.resolve(run(manager)),
      ),
    };
    const target = new CourseLmsService(
      modules as never,
      materials as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { target, modules, materials, dataSource };
  }

  it('deletes an empty unit owned by the faculty member', async () => {
    const { target, modules } = service(0);

    await expect(
      target.deleteModule('faculty-id', 'tenant-id', 'module-id'),
    ).resolves.toEqual({ deleted: true, module_id: 'module-id' });
    expect(modules.remove).toHaveBeenCalledTimes(1);
  });

  it('preserves units with current or archived materials', async () => {
    const { target, modules, materials } = service(2);

    await expect(
      target.deleteModule('faculty-id', 'tenant-id', 'module-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(materials.count).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-id', module_id: 'module-id' },
      withDeleted: true,
    });
    expect(modules.findOne).toHaveBeenLastCalledWith({
      where: { tenant_id: 'tenant-id', module_id: 'module-id' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(modules.remove).not.toHaveBeenCalled();
  });
});
