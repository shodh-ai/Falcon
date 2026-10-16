import { resolve } from 'path';
import {
  canonicalUploadKey,
  isFileWithinRoot,
  needsStudentFileOwnership,
} from './upload-file-access';

describe('Upload file identity and ownership classification', () => {
  const root = resolve('uploads');
  const tenant = 'tenant-a';
  const key = `${tenant}/2026/10/file.pdf`;

  it.each([
    key,
    `/uploads/${key}`,
    `s3://falcon-uploads/${key}`,
    resolve(root, key),
    `./uploads/${key}`,
  ])('canonicalizes a legacy storage reference: %s', (reference) => {
    expect(canonicalUploadKey(reference, tenant, root)).toBe(key);
  });

  it.each([
    '/uploads/tenant-b/2026/file.pdf',
    '/uploads/tenant-a-other/2026/file.pdf',
    '/uploads/tenant-a/../tenant-b/file.pdf',
    'tenant-a/../tenant-b/file.pdf',
    'tenant-a/./file.pdf',
    'https://example.com/tenant-a/file.pdf',
    'file://tenant-a/file.pdf',
    's3://bucket/tenant-a/../tenant-b/file.pdf',
    'tenant-a//file.pdf',
    resolve(`${root}-other`, tenant, 'file.pdf'),
    '',
  ])(
    'rejects cross-tenant, sibling, traversal or remote identity: %s',
    (reference) => {
      expect(canonicalUploadKey(reference, tenant, root)).toBeNull();
    },
  );

  it('checks complete path segments instead of a string prefix', () => {
    expect(isFileWithinRoot(root, resolve(root, 'tenant-a/file.pdf'))).toBe(
      true,
    );
    expect(isFileWithinRoot(root, root)).toBe(false);
    expect(isFileWithinRoot(root, resolve(`${root}-other/file.pdf`))).toBe(
      false,
    );
    expect(
      isFileWithinRoot(
        resolve(root, tenant),
        resolve(root, `${tenant}-other/file.pdf`),
      ),
    ).toBe(false);
  });

  it('requires Student/Applicant ownership while preserving existing staff and multi-role access', () => {
    expect(needsStudentFileOwnership({ role: 'Student' })).toBe(true);
    expect(needsStudentFileOwnership({ roles: ['Applicant'] })).toBe(true);
    expect(needsStudentFileOwnership({ roles: ['Student', 'Applicant'] })).toBe(
      true,
    );
    expect(needsStudentFileOwnership({ roles: ['Student', 'Faculty'] })).toBe(
      false,
    );
    expect(
      needsStudentFileOwnership({ role: 'Student', roles: ['Registrar'] }),
    ).toBe(false);
    expect(needsStudentFileOwnership({ roles: ['Accountant'] })).toBe(false);
    expect(
      needsStudentFileOwnership({ roles: ['Student', 'CampusAdmin'] }),
    ).toBe(false);
    expect(
      needsStudentFileOwnership({ roles: ['Student', 'AdmissionsOfficer'] }),
    ).toBe(false);
  });
});
