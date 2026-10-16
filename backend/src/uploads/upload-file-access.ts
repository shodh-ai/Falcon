import { isAbsolute, relative, resolve, sep } from 'path';
import { rolesIntersect } from '../common/config/campus-admin.roles';

export type UploadUser = {
  tenant_id?: string;
  user_id?: string;
  role?: string;
  roles?: string[];
};

export const SHARED_UPLOAD_ROLES = [
  'Student',
  'Faculty',
  'HOD',
  'Dean',
  'SuperAdmin',
  'Admin',
  'IQAC',
  'HR',
  'HRAdmin',
  'Registrar',
  'President',
  'ExamCell',
  'Accountant',
  'HostelAdmin',
] as const;

export function uploadRoles(user: UploadUser): string[] {
  return [...(user.roles ?? []), user.role ?? ''].map((role) =>
    role.trim().toLowerCase(),
  );
}

/** Preserve staff file access when a staff member also holds a Student role. */
export function needsStudentFileOwnership(user: UploadUser): boolean {
  const roles = uploadRoles(user);
  return (
    roles.some((role) => role === 'student' || role === 'applicant') &&
    !rolesIntersect(
      roles,
      SHARED_UPLOAD_ROLES.filter((role) => role !== 'Student'),
    )
  );
}

/** A directory name prefix is not a containment check: uploads-other is outside uploads. */
export function isFileWithinRoot(root: string, filePath: string): boolean {
  const fromRoot = relative(resolve(root), resolve(filePath));
  return (
    Boolean(fromRoot) &&
    fromRoot !== '..' &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

/** Resolve only this application's storage references, never remote HTTP URLs. */
export function canonicalUploadKey(
  reference: string | null | undefined,
  tenantId: string,
  uploadRoot: string,
): string | null {
  if (!reference || reference.includes('\0')) return null;
  let value = reference;
  if (value.startsWith('s3://')) {
    const object = /^s3:\/\/[^/]+\/(.+)$/.exec(value);
    if (!object) return null;
    // Storage reads always use the configured bucket, never a supplied host.
    value = object[1];
  } else if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    return null;
  }
  const slashValue = value.replace(/\\/g, '/');
  if (slashValue.split('/').some((segment) => segment === '..')) return null;

  let key: string;
  if (slashValue.startsWith('/uploads/')) {
    key = slashValue.slice('/uploads/'.length);
  } else if (slashValue.startsWith(`${tenantId}/`)) {
    key = slashValue;
  } else {
    const absolute = resolve(value);
    if (!isFileWithinRoot(uploadRoot, absolute)) return null;
    key = relative(resolve(uploadRoot), absolute).split(sep).join('/');
  }
  if (
    !key.startsWith(`${tenantId}/`) ||
    key.includes('//') ||
    key.split('/').includes('.')
  )
    return null;
  return key;
}
