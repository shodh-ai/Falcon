import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CourseLmsService } from './course-lms.service';

jest.mock('uuid', () => ({ v4: () => 'synthetic-uuid' }));

describe('LMS material preservation', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'falcon-material-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });
  function fixture() {
    const file = join(root, 'original.pdf');
    writeFileSync(file, 'synthetic original bytes');
    const material = {
      material_id: 'material-a',
      tenant_id: 'tenant-a',
      course_id: 'course-a',
      faculty_user_id: 'faculty-a',
      file_path: file,
      file_key: null,
      deleted_at: null,
    };
    const materials = {
      findOne: jest.fn().mockResolvedValue(material),
      softRemove: jest.fn().mockResolvedValue(material),
      remove: jest.fn(),
    };
    const target = new CourseLmsService(
      {} as any,
      materials as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { isEnabled: jest.fn().mockReturnValue(false) } as any,
      {} as any,
    );
    return { target, materials, material, file };
  }

  it('archives the tenant-scoped record and leaves original bytes/references intact', async () => {
    const { target, materials, material, file } = fixture();
    expect(
      await target.deleteCourseMaterial('faculty-a', 'tenant-a', 'material-a'),
    ).toEqual({ deleted: true, material_id: 'material-a' });
    expect(materials.findOne).toHaveBeenCalledWith({
      where: { material_id: 'material-a', tenant_id: 'tenant-a' },
    });
    expect(materials.softRemove).toHaveBeenCalledWith(material);
    expect(materials.remove).not.toHaveBeenCalled();
    expect(readFileSync(file, 'utf8')).toBe('synthetic original bytes');
    expect(material.file_path).toBe(file);
  });

  it('preserves original bytes if database archival fails', async () => {
    const { target, materials, file } = fixture();
    materials.softRemove.mockRejectedValue(
      new Error('Synthetic database failure'),
    );
    await expect(
      target.deleteCourseMaterial('faculty-a', 'tenant-a', 'material-a'),
    ).rejects.toThrow('Synthetic database failure');
    expect(readFileSync(file, 'utf8')).toBe('synthetic original bytes');
  });

  it('denies another tenant/missing material and an unallocated faculty member', async () => {
    const { target, materials } = fixture();
    materials.findOne.mockResolvedValueOnce(null);
    await expect(
      target.deleteCourseMaterial('faculty-a', 'tenant-b', 'material-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    jest
      .spyOn(target as any, 'assertFacultyTeaches')
      .mockRejectedValue(new Error('Not assigned'));
    await expect(
      target.deleteCourseMaterial('stranger', 'tenant-a', 'material-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(materials.softRemove).not.toHaveBeenCalled();
  });

  it('returns not found for archived material on the student download path', async () => {
    const { target, materials } = fixture();
    // Repository default reads exclude DeleteDateColumn rows; no withDeleted override.
    materials.findOne.mockResolvedValue(null);
    await expect(
      target.getMaterialForStudentDownload(
        'student-a',
        'tenant-a',
        'material-a',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(materials.findOne.mock.calls[0][0]).not.toHaveProperty(
      'withDeleted',
    );
  });
});
