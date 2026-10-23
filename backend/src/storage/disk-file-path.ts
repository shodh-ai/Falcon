import { existsSync, realpathSync, statSync } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';

export function uploadRoot(): string {
  return resolve(process.env.UPLOAD_PATH || './uploads');
}

/** A strict descendant, not the directory itself or a similarly named sibling. */
export function isPathWithin(root: string, target: string): boolean {
  const distance = relative(resolve(root), resolve(target));
  return (
    distance !== '' &&
    distance !== '..' &&
    !distance.startsWith(`..${sep}`) &&
    !isAbsolute(distance)
  );
}

export function isSafeTenantId(tenantId: unknown): tenantId is string {
  return typeof tenantId === 'string' && /^[a-zA-Z0-9_-]+$/.test(tenantId);
}

export function isSafeStorageKey(key: unknown, tenantId?: unknown): boolean {
  if (
    typeof key !== 'string' ||
    !key ||
    key !== key.trim() ||
    // eslint-disable-next-line no-control-regex -- Reject control characters in untrusted storage keys.
    /[\\\x00-\x1f:]/.test(key)
  ) {
    return false;
  }
  const parts = key.split('/');
  if (
    parts.length < 2 ||
    !isSafeTenantId(parts[0]) ||
    parts.some(
      (part) =>
        !part ||
        part !== part.trim() ||
        part.endsWith('.') ||
        part === '.' ||
        part === '..',
    )
  ) {
    return false;
  }
  return (
    tenantId == null || (isSafeTenantId(tenantId) && parts[0] === tenantId)
  );
}

/** Resolve supported legacy file locations, never URLs or files outside uploads. */
export function resolveStoredDiskPath(filePath: unknown): string | null {
  if (typeof filePath !== 'string' || !filePath.trim()) return null;
  const value = filePath.trim();
  if (
    // eslint-disable-next-line no-control-regex -- Reject control characters in untrusted file paths.
    /[\x00-\x1f]/.test(value) ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ||
    value
      .replace(/\\/g, '/')
      .split('/')
      .some(
        (part) =>
          part === '..' ||
          (part !== '.' && (part.endsWith('.') || part.endsWith(' '))),
      )
  ) {
    return null;
  }

  const root = uploadRoot();
  const portable = value.replace(/\\/g, '/');
  const candidates = portable.startsWith('/uploads/')
    ? [resolve(root, portable.slice('/uploads/'.length))]
    : isAbsolute(value)
      ? [resolve(value)]
      : [resolve(process.cwd(), value), resolve(root, value)];

  try {
    if (!existsSync(root)) return null;
    const realRoot = realpathSync(root);
    for (const candidate of candidates) {
      if (!isPathWithin(root, candidate) || !existsSync(candidate)) continue;
      const realFile = realpathSync(candidate);
      if (isPathWithin(realRoot, realFile) && statSync(realFile).isFile()) {
        return realFile;
      }
    }
  } catch {
    // Missing, inaccessible and invalid locations share a not-found response.
  }
  return null;
}

export function resolveTenantDiskPath(
  filePath: string,
  tenantId: string,
): string | null {
  if (!isSafeTenantId(tenantId)) return null;
  const resolved = resolveStoredDiskPath(filePath);
  if (!resolved) return null;
  try {
    const tenantRoot = resolve(realpathSync(uploadRoot()), tenantId);
    return isPathWithin(tenantRoot, resolved) ? resolved : null;
  } catch {
    return null;
  }
}
