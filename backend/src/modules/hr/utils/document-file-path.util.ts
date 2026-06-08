import { createReadStream, existsSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import type { Readable } from 'stream';
import { ObjectStorageService } from '../../../storage/object-storage.service';
import { parseStorageKey } from './s3-key.util';

export function uploadRoot(): string {
  return resolve(process.env.UPLOAD_PATH || './uploads');
}

/** Resolve a local disk path for a stored document file_url. */
export function resolveDocumentDiskPath(fileUrl: string): string | null {
  if (!fileUrl?.trim()) return null;
  const trimmed = fileUrl.trim();
  const root = uploadRoot();

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
): Promise<Readable | null> {
  const key = parseStorageKey(fileUrl);
  if (key && storage.isEnabled()) {
    return storage.getDownloadStream(key);
  }
  const diskPath = resolveDocumentDiskPath(fileUrl);
  if (diskPath) {
    return createReadStream(diskPath);
  }
  return null;
}
