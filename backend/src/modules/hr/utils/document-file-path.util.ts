import { createReadStream } from 'fs';
import { resolve } from 'path';
import type { Readable } from 'stream';
import { ObjectStorageService } from '../../../storage/object-storage.service';
import {
  isSafeStorageKey,
  resolveStoredDiskPath,
  resolveTenantDiskPath,
} from '../../../storage/disk-file-path';
import { parseStorageKey } from './s3-key.util';

export function uploadRoot(): string {
  return resolve(process.env.UPLOAD_PATH || './uploads');
}

/** Resolve a local disk path for a stored document file_url. */
export function resolveDocumentDiskPath(
  fileUrl: string,
  tenantId?: string,
): string | null {
  return tenantId === undefined
    ? resolveStoredDiskPath(fileUrl)
    : resolveTenantDiskPath(fileUrl, tenantId);
}

/** Open a readable stream for a vault document (S3 or local disk). */
export async function openDocumentReadStream(
  fileUrl: string,
  storage: ObjectStorageService,
  tenantId?: string,
): Promise<Readable | null> {
  const key = parseStorageKey(fileUrl);
  if (key && storage.isEnabled()) {
    if (!isSafeStorageKey(key, tenantId)) return null;
    return storage.getDownloadStream(key);
  }
  const diskPath = resolveDocumentDiskPath(fileUrl, tenantId);
  if (diskPath) {
    return createReadStream(diskPath);
  }
  return null;
}
