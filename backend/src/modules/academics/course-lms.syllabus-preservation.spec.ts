import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AcademicCourse } from '../../entities/academic-course.entity';
import { CourseMaterial } from '../../entities/course-material.entity';
import { CourseLmsService } from './course-lms.service';
import { IsNull, Not } from 'typeorm';

jest.mock('uuid', () => ({ v4: () => 'synthetic-uuid' }));

describe('Syllabus replacement material preservation', () => {
  function fixture(materialCount: number) {
    const course = {
      findOne: jest.fn().mockResolvedValue({ course_id: 'course' }),
    };
    const materials = { count: jest.fn().mockResolvedValue(materialCount) };
    const modules = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((row: unknown) => row),
      save: jest.fn().mockResolvedValue([]),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === AcademicCourse) return course;
        if (entity === CourseMaterial) return materials;
        return modules;
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        async (run: (value: typeof manager) => Promise<unknown>) =>
          run(manager),
      ),
    };
    const target = new CourseLmsService(
      {} as never,
      {} as never,
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
    );
    const access = target as unknown as {
      assertFacultyTeaches: () => Promise<void>;
    };
    const authorize = jest
      .spyOn(access, 'assertFacultyTeaches')
      .mockResolvedValue();
    const workspace = jest
      .spyOn(target, 'getFacultyWorkspace')
      .mockResolvedValue({} as never);
    return {
      target,
      dataSource,
      course,
      materials,
      modules,
      authorize,
      workspace,
    };
  }

  it.each(['current', 'archived'])(
    'blocks replacement with %s linked material',
    async () => {
      const { target, course, materials, modules, workspace } = fixture(1);
      await expect(
        target.setupSyllabus('faculty', 'tenant', 'course', [
          { module_number: 1, title: 'Replacement' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(course.findOne).toHaveBeenCalledWith({
        where: { tenant_id: 'tenant', course_id: 'course' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(materials.count).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant',
          course_id: 'course',
          module_id: Not(IsNull()),
        },
        withDeleted: true,
      });
      expect(modules.delete).not.toHaveBeenCalled();
      expect(modules.save).not.toHaveBeenCalled();
      expect(workspace).not.toHaveBeenCalled();
    },
  );

  it('preserves replacement of a syllabus without linked materials', async () => {
    const { target, modules, workspace } = fixture(0);
    await target.setupSyllabus('faculty', 'tenant', 'course', [
      { module_number: 1, title: ' New unit ' },
    ]);
    expect(modules.delete).toHaveBeenCalledWith({
      tenant_id: 'tenant',
      course_id: 'course',
    });
    expect(modules.save).toHaveBeenCalledWith([
      expect.objectContaining({
        title: 'New unit',
        faculty_user_id: 'faculty',
      }),
    ]);
    expect(workspace).toHaveBeenCalledTimes(1);
  });

  it('rejects denied faculty before opening a destructive transaction', async () => {
    const { target, authorize, dataSource } = fixture(0);
    authorize.mockRejectedValue(new ForbiddenException('Denied'));
    await expect(
      target.setupSyllabus('other-faculty', 'tenant', 'course', [
        { module_number: 1, title: 'Replacement' },
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('propagates save failure from the transaction without reporting success', async () => {
    const { target, modules, workspace } = fixture(0);
    modules.save.mockRejectedValue(new Error('Synthetic save failure'));
    await expect(
      target.setupSyllabus('faculty', 'tenant', 'course', [
        { module_number: 1, title: 'Replacement' },
      ]),
    ).rejects.toThrow('Synthetic save failure');
    expect(workspace).not.toHaveBeenCalled();
  });
});
