import { createReadStream, existsSync, realpathSync, statSync } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';
import type { Readable } from 'stream';
import { ObjectStorageService } from '../../../storage/object-storage.service';
import { parseStorageKey } from './s3-key.util';

export function uploadRoot(): string {
  return resolve(process.env.UPLOAD_PATH || './uploads');
}

function isTenantSegment(tenantId: string): boolean {
  return (
    Boolean(tenantId) &&
    tenantId !== '.' &&
    tenantId !== '..' &&
    !tenantId.includes('/') &&
    !tenantId.includes('\\') &&
    !/[\0\r\n]/.test(tenantId)
  );
}

/** Only server-issued upload keys in the caller's tenant namespace are readable. */
export function parseTenantStorageKey(
  fileUrl: string,
  tenantId: string,
  bucket?: string,
): string | null {
  if (!fileUrl?.trim() || !isTenantSegment(tenantId)) return null;
  const reference = fileUrl.trim();
  if (reference.startsWith('s3://')) {
    try {
      const parsed = new URL(reference);
      if (bucket && parsed.hostname !== bucket) return null;
    } catch {
      return null;
    }
  } else {
    // The only legacy object-store link accepted here is Falcon's own relative
    // download route. An absolute URL must never act as an upload credential.
    if (!reference.startsWith('/api/uploads/download?')) return null;
    try {
      const parsed = new URL(reference, 'http://localhost');
      if (
        parsed.origin !== 'http://localhost' ||
        parsed.pathname !== '/api/uploads/download' ||
        parsed.searchParams.getAll('key').length !== 1
      ) {
        return null;
      }
    } catch {
      return null;
    }
  }

  let key: string | null;
  try {
    key = parseStorageKey(reference);
  } catch {
    return null;
  }
  if (!key) return null;
  const segments = key.split('/');
  if (
    segments.length < 2 ||
    segments[0] !== tenantId ||
    segments.some(
      (part) =>
        !part || part === '.' || part === '..' || /[\\\0\r\n?#]/.test(part),
    )
  ) {
    return null;
  }
  return key;
}

function isInsideDirectory(path: string, directory: string): boolean {
  const remainder = relative(directory, path);
  return (
    remainder !== '' &&
    remainder !== '..' &&
    !remainder.startsWith(`..${sep}`) &&
    !isAbsolute(remainder)
  );
}

/** Resolve a local disk path for a stored document file_url. */
export function resolveDocumentDiskPath(
  fileUrl: string,
  tenantId?: string,
): string | null {
  if (!fileUrl?.trim()) return null;
  const trimmed = fileUrl.trim();
  const root = uploadRoot();

  if (tenantId !== undefined) {
    if (!isTenantSegment(tenantId)) return null;
    let fullPath: string;
    if (trimmed.startsWith('/uploads/')) {
      fullPath = resolve(root, trimmed.slice('/uploads/'.length));
    } else if (trimmed.startsWith('uploads/')) {
      fullPath = resolve(root, trimmed.slice('uploads/'.length));
    } else if (trimmed.startsWith('./uploads/')) {
      fullPath = resolve(root, trimmed.slice('./uploads/'.length));
    } else if (isAbsolute(trimmed)) {
      // Some historical rows recorded the absolute upload path.
      fullPath = trimmed;
    } else {
      return null;
    }
    if (!existsSync(fullPath)) return null;
    try {
      const realTenantRoot = realpathSync(resolve(root, tenantId));
      const realFile = realpathSync(fullPath);
      return isInsideDirectory(realFile, realTenantRoot) &&
        statSync(realFile).isFile()
        ? realFile
        : null;
    } catch {
      return null;
    }
  }

  if (isAbsolute(trimmed) && existsSync(trimmed)) return trimmed;

  const fromCwd = resolve(process.cwd(), trimmed.replace(/^\.\//, ''));
  if (existsSync(fromCwd)) return fromCwd;

  const stripped = trimmed.replace(/^\.?\/?uploads\//, '');
  const fromUploadRoot = resolve(root, stripped);
  if (existsSync(fromUploadRoot)) return fromUploadRoot;

  return null;
}

/** Open a readable stream for a vault document (S3 or local disk). */
export async function openDocumentReadStream(
  fileUrl: string,
  storage: ObjectStorageService,
  tenantId?: string,
): Promise<Readable | null> {
  const key =
    tenantId !== undefined
      ? parseTenantStorageKey(fileUrl, tenantId, storage.getBucketName())
      : parseStorageKey(fileUrl);
  if (key && storage.isEnabled()) {
    return storage.getDownloadStream(key);
  }
  const diskPath = resolveDocumentDiskPath(key ? `/uploads/${key}` : fileUrl, tenantId);
  if (diskPath) {
    return createReadStream(diskPath);
  }
  return null;
}
