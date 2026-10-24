import { BadRequestException } from '@nestjs/common';
import { CourseLmsService } from './course-lms.service';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

describe('Course LMS section-scoped material publish', () => {
  const sectionId = '11111111-1111-4111-8111-111111111111';
  function setup(validIds: string[]) {
    const materials = {
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => ({ ...row, material_id: 'material-1' })),
    };
    const allocations = { find: jest.fn() };
    const manager = {
      save: jest.fn(async (_entity, row) => ({
        ...row,
        material_id: 'material-1',
      })),
      query: jest.fn().mockResolvedValue([]),
    };
    const dataSource = {
      query: jest
        .fn()
        .mockImplementation(async (sql: string) =>
          sql.includes('SELECT a.allocation_id')
            ? validIds.map((allocation_id) => ({ allocation_id }))
            : [],
        ),
      transaction: jest.fn(async (work) => work(manager)),
    };
    const target = new CourseLmsService(
      {} as any,
      materials as any,
      {} as any,
      allocations as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(target as any, 'resolveHodDepartmentIds').mockResolvedValue([]);
    return { target, materials, allocations, dataSource, manager };
  }

  it('publishes validated IDs without loading the schema-incompatible allocation entity', async () => {
    const { target, allocations, dataSource } = setup(['allocation-1']);
    await (target as any).attachMaterialVisibility(
      'material-1',
      ['allocation-1'],
      'faculty-1',
      'tenant-1',
      'course-1',
    );
    expect(allocations.find).not.toHaveBeenCalled();
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO course_material_visibility'),
      ['material-1', ['allocation-1']],
    );
  });

  it('rejects invalid section IDs before writing visibility', async () => {
    const { target, dataSource } = setup([]);
    await expect(
      (target as any).attachMaterialVisibility(
        'material-1',
        ['other-tenant-section'],
        'faculty-1',
        'tenant-1',
        'course-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.query).toHaveBeenCalledTimes(1); // validation only; no insert
  });

  it('rejects an invalid section before storing any uploaded file or DB row', async () => {
    const { target, dataSource, manager } = setup([]);
    jest.spyOn(target as any, 'getModuleForFaculty').mockResolvedValue({
      module_id: 'module-1',
      course_id: 'course-1',
      title: 'Unit 1',
    });
    jest
      .spyOn(target as any, 'getCourseOrFail')
      .mockResolvedValue({ course_name: 'Course' });
    const persist = jest.spyOn(target as any, 'persistFile').mockResolvedValue({
      filePath: '/tmp/file.pdf',
      fileKey: null,
    });
    await expect(
      target.uploadModuleMaterials(
        'faculty-1',
        'tenant-1',
        'module-1',
        [{ originalname: 'file.pdf' } as any],
        { allocation_ids: [sectionId] },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(persist).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('does not publish globally when the course has teaching sections', async () => {
    const { target, dataSource } = setup([]);
    dataSource.query.mockResolvedValueOnce([{ allocation_id: sectionId }]);
    jest.spyOn(target as any, 'getModuleForFaculty').mockResolvedValue({
      module_id: 'module-1',
      course_id: 'course-1',
      title: 'Unit 1',
    });
    jest
      .spyOn(target as any, 'getCourseOrFail')
      .mockResolvedValue({ course_name: 'Course' });
    const persist = jest.spyOn(target as any, 'persistFile');
    await expect(
      target.uploadModuleMaterials(
        'faculty-1',
        'tenant-1',
        'module-1',
        [{ originalname: 'file.pdf' } as any],
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(persist).not.toHaveBeenCalled();
  });

  it('commits the file and its section visibility in one DB transaction', async () => {
    const { target, dataSource, manager } = setup([sectionId]);
    jest.spyOn(target as any, 'getModuleForFaculty').mockResolvedValue({
      module_id: 'module-1',
      course_id: 'course-1',
      title: 'Unit 1',
    });
    jest
      .spyOn(target as any, 'getCourseOrFail')
      .mockResolvedValue({ course_name: 'Course' });
    jest.spyOn(target as any, 'persistFile').mockResolvedValue({
      filePath: '/tmp/file.pdf',
      fileKey: null,
    });
    jest
      .spyOn(target as any, 'notifyStudentsForMaterialBestEffort')
      .mockResolvedValue(undefined);
    await expect(
      target.uploadModuleMaterials(
        'faculty-1',
        'tenant-1',
        'module-1',
        [{ originalname: 'file.pdf' } as any],
        { allocation_ids: [sectionId] },
      ),
    ).resolves.toMatchObject({ materials: [{ material_id: 'material-1' }] });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO course_material_visibility'),
      ['material-1', [sectionId]],
    );
  });

  it('stores a canonical YouTube link with the same section scope', async () => {
    const { target, manager } = setup([sectionId]);
    jest.spyOn(target as any, 'getModuleForFaculty').mockResolvedValue({
      module_id: 'module-1',
      course_id: 'course-1',
      title: 'Unit 1',
    });
    jest
      .spyOn(target as any, 'getCourseOrFail')
      .mockResolvedValue({ course_name: 'Course' });
    jest
      .spyOn(target as any, 'notifyStudentsForMaterialBestEffort')
      .mockResolvedValue(undefined);
    await target.addYouTubeMaterial('faculty-1', 'tenant-1', 'module-1', {
      title: 'Lesson video',
      url: 'https://youtu.be/AbCdEf123_-?t=20',
      allocation_ids: [sectionId],
    });
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: 'Lesson video',
        material_type: 'YOUTUBE',
        file_path: '',
        external_url: 'https://www.youtube.com/watch?v=AbCdEf123_-',
      }),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO course_material_visibility'),
      ['material-1', [sectionId]],
    );
  });
});
