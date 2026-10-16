import { getApiBaseUrl } from '@/lib/api-base-url';

/** Keep stored disk/object references behind Falcon's authenticated ownership check. */
export function vaultDownloadPath(reference: string): string {
  const value = reference.trim();
  if (!value || value === '#') throw new Error('No original file is attached to this record.');

  let path = value;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    const allowedOrigins = [new URL(getApiBaseUrl()).origin, window.location.origin];
    if (!allowedOrigins.includes(url.origin)) {
      throw new Error('This file is not available through the document vault.');
    }
    path = `${url.pathname}${url.search}`;
  }
  if (/^\/(?:api\/)?uploads\/download\?/.test(path)) {
    const url = new URL(path, 'https://vault.invalid');
    const key = url.searchParams.get('key');
    const filePath = url.searchParams.get('path');
    if (key) return `/api/uploads/download?key=${encodeURIComponent(key)}`;
    if (filePath) return `/api/uploads/download?path=${encodeURIComponent(filePath)}`;
    throw new Error('No original file is attached to this record.');
  }
  // API authorization validates the tenant, owner and storage root for this reference.
  return `/api/uploads/download?path=${encodeURIComponent(path)}`;
}

export function vaultFileType(blob: Blob): { kind: 'pdf' | 'image'; extension: string } {
  const types: Record<string, { kind: 'pdf' | 'image'; extension: string }> = {
    'application/pdf': { kind: 'pdf', extension: 'pdf' },
    'image/jpeg': { kind: 'image', extension: 'jpg' },
    'image/png': { kind: 'image', extension: 'png' },
  };
  const type = types[blob.type.toLowerCase().split(';')[0]];
  if (!blob.size || !type) throw new Error('The server did not return a supported PDF or image.');
  return type;
}
