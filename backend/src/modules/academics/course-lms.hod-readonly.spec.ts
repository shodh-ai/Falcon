import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CourseLmsService } from './course-lms.service';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

describe('HOD course oversight access', () => {
  function setup() {
    const modules = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue({ module_id: 'unit-1', tenant_id: 'tenant-1', course_id: 'course-1', faculty_user_id: 'teacher-1' }) };
    const materials = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue({ material_id: 'material-1', tenant_id: 'tenant-1', course_id: 'course-1', faculty_user_id: 'teacher-1' }), softRemove: jest.fn() };
    const courses = { findOne: jest.fn().mockResolvedValue({ course_id: 'course-1', course_code: 'BP103T', course_name: 'Pharmaceutics', credits: 4 }) };
    const timetable = { findOne: jest.fn().mockResolvedValue(null) };
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT d.dept_id FROM departments')) return [{ dept_id: 43 }];
      if (sql.includes('SELECT 1\n         WHERE EXISTS')) return [{ '?column?': 1 }];
      return [];
    });
    const notification = { create: jest.fn() };
    const service = new CourseLmsService(
      modules as any, materials as any, {} as any, {} as any,
      courses as any, {} as any, timetable as any, {} as any,
      { query, transaction: jest.fn() } as any, {} as any, {} as any,
      {} as any, notification as any,
    );
    return { service, modules, materials, courses, timetable, query, notification };
  }

  it('lets an appointed HOD view a department course but blocks faculty editing access', async () => {
    const { service, modules, materials } = setup();
    await expect(service.getHodCourseWorkspace('hod-1', 'tenant-1', 'course-1'))
      .resolves.toMatchObject({ course: { course_code: 'BP103T' }, modules: [] });
    await expect(service.getFacultyWorkspace('hod-1', 'tenant-1', 'course-1'))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.setupSyllabus('hod-1', 'tenant-1', 'course-1', [{ module_number: 1, title: 'Unit' }]))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteCourseMaterial('hod-1', 'tenant-1', 'material-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(modules.find).toHaveBeenCalled();
    expect(materials.softRemove).not.toHaveBeenCalled();
  });

  it('rejects an HOD outside the course department', async () => {
    const { service, query } = setup();
    query.mockImplementation(async (sql: string) => sql.includes('SELECT d.dept_id FROM departments') ? [{ dept_id: 99 }] : []);
    await expect(service.getHodCourseWorkspace('hod-other', 'tenant-1', 'course-1'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('cannot notify a faculty member who has no active allocation for the course', async () => {
    const { service, notification } = setup();
    await expect(service.notifyHodCourseFaculty('hod-1', 'tenant-1', 'course-1', 'outsider', 'Please review'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(notification.create).not.toHaveBeenCalled();
  });
});
