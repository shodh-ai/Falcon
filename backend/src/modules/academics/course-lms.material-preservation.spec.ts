import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CourseLmsService } from './course-lms.service';

jest.mock('uuid', () => ({ v4: () => 'synthetic-uuid' }));

describe('LMS recoverable material deletion', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'falcon-material-preservation-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function fixture() {
    const file = join(root, 'original.pdf');
    writeFileSync(file, 'Synthetic original, never production data');
    const material = {
      material_id: 'material-a',
      tenant_id: 'tenant-a',
      course_id: 'course-a',
      module_id: 'module-a',
      faculty_user_id: 'faculty-a',
      file_path: file,
      file_key: null,
      title: 'Original title',
      deleted_at: null as Date | null,
    };
    const visibility = [
      { material_id: 'material-a', allocation_id: 'section-a' },
    ];
    const materials = {
      findOne: jest.fn().mockResolvedValue(material),
      softRemove: jest.fn().mockImplementation(() => {
        material.deleted_at = new Date('2026-10-23T00:00:00Z');
        return Promise.resolve(material);
      }),
      remove: jest.fn(),
    };
    const materialVisibility = {
      find: jest.fn().mockResolvedValue(visibility),
      delete: jest.fn(),
      remove: jest.fn(),
    };
    const objectStorage = { isEnabled: jest.fn().mockReturnValue(false) };
    const target = new CourseLmsService(
      {} as never,
      materials as never,
      materialVisibility as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      objectStorage as never,
      {} as never,
    );
    return {
      target,
      materials,
      material,
      materialVisibility,
      objectStorage,
      file,
    };
  }

  function hash(file: string) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  }

  it('archives the record while preserving original bytes, metadata and visibility', async () => {
    const { target, materials, material, materialVisibility, file } = fixture();
    const originalHash = hash(file);
    const originalMetadata = { ...material };
    await expect(
      target.deleteCourseMaterial('faculty-a', 'tenant-a', 'material-a'),
    ).resolves.toEqual({ deleted: true, material_id: 'material-a' });
    expect(materials.findOne).toHaveBeenCalledWith({
      where: { material_id: 'material-a', tenant_id: 'tenant-a' },
    });
    expect(materials.softRemove).toHaveBeenCalledWith(material);
    expect(materials.remove).not.toHaveBeenCalled();
    expect(material.deleted_at).toBeInstanceOf(Date);
    expect({ ...material, deleted_at: null }).toEqual(originalMetadata);
    expect(hash(file)).toBe(originalHash);
    expect(materialVisibility.delete).not.toHaveBeenCalled();
    expect(materialVisibility.remove).not.toHaveBeenCalled();
  });

  it('leaves original bytes and metadata intact when archival fails', async () => {
    const { target, materials, material, file } = fixture();
    const originalHash = hash(file);
    materials.softRemove.mockRejectedValue(
      new Error('Synthetic database failure'),
    );
    await expect(
      target.deleteCourseMaterial('faculty-a', 'tenant-a', 'material-a'),
    ).rejects.toThrow('Synthetic database failure');
    expect(hash(file)).toBe(originalHash);
    expect(material.deleted_at).toBeNull();
  });

  it('rejects foreign-tenant/missing materials without modifying anything', async () => {
    const { target, materials, file } = fixture();
    const originalHash = hash(file);
    materials.findOne.mockResolvedValueOnce(null);
    await expect(
      target.deleteCourseMaterial('faculty-a', 'tenant-b', 'material-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(materials.findOne).toHaveBeenCalledWith({
      where: { material_id: 'material-a', tenant_id: 'tenant-b' },
    });
    expect(materials.softRemove).not.toHaveBeenCalled();
    expect(hash(file)).toBe(originalHash);
  });

  it('rejects an unassigned non-owner without modifying the original', async () => {
    const { target, materials, file } = fixture();
    const access = target as unknown as {
      assertFacultyTeaches: () => Promise<void>;
    };
    jest
      .spyOn(access, 'assertFacultyTeaches')
      .mockRejectedValue(new Error('Denied'));
    const originalHash = hash(file);
    await expect(
      target.deleteCourseMaterial('stranger', 'tenant-a', 'material-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(materials.softRemove).not.toHaveBeenCalled();
    expect(hash(file)).toBe(originalHash);
  });

  it('keeps existing assigned-faculty authorization', async () => {
    const { target, materials } = fixture();
    const access = target as unknown as {
      assertFacultyTeaches: () => Promise<void>;
    };
    jest.spyOn(access, 'assertFacultyTeaches').mockResolvedValue();
    await target.deleteCourseMaterial(
      'assigned-faculty',
      'tenant-a',
      'material-a',
    );
    expect(materials.softRemove).toHaveBeenCalledTimes(1);
  });

  it('keeps object-store keys without calling storage removal', async () => {
    const { target, material, objectStorage } = fixture();
    Object.assign(material, {
      file_key: 'tenant-a/course-materials/original.pdf',
    });
    objectStorage.isEnabled.mockReturnValue(true);
    await target.deleteCourseMaterial('faculty-a', 'tenant-a', 'material-a');
    expect(material.file_key).toBe('tenant-a/course-materials/original.pdf');
    expect(objectStorage.isEnabled).not.toHaveBeenCalled();
  });

  it('does not opt archived records into student downloads', async () => {
    const { target, materials } = fixture();
    // TypeORM repository defaults exclude the inherited DeleteDateColumn.
    materials.findOne.mockResolvedValue(null);
    await expect(
      target.getMaterialForStudentDownload(
        'student-a',
        'tenant-a',
        'material-a',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(materials.findOne).toHaveBeenCalledWith({
      where: { material_id: 'material-a', tenant_id: 'tenant-a' },
    });
  });
});
