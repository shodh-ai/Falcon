/** Resolve an S3 object key from stored file_url variants. */
export function parseStorageKey(fileUrl: string): string | null {
  if (!fileUrl?.trim()) return null;
  const trimmed = fileUrl.trim();
  if (trimmed.startsWith('s3://')) {
    const withoutScheme = trimmed.slice('s3://'.length);
    const slash = withoutScheme.indexOf('/');
    return slash >= 0 ? withoutScheme.slice(slash + 1) : null;
  }
  try {
    const url = new URL(trimmed, 'http://localhost');
    const keyParam = url.searchParams.get('key');
    if (keyParam) return decodeURIComponent(keyParam);
  } catch {
    /* not a URL */
  }
  if (trimmed.startsWith('/uploads/') || trimmed.includes('/uploads/')) {
    const match = trimmed.match(/\/uploads\/download\?key=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}
