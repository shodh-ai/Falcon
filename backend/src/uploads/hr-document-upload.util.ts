export const HR_DOCUMENT_UPLOAD_PURPOSE = 'HR_DOCUMENT';
const HR_DOCUMENT_NAMESPACE = 'hr-documents';

function safeSegment(value: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

/** Only the shared authenticated uploader assigns the employee namespace. */
export function ownedHrUploadName(
  ownerId: string,
  filename: string,
): string | null {
  if (!safeSegment(ownerId) || !filename || /[\\/\0\r\n?#]/.test(filename))
    return null;
  return `${HR_DOCUMENT_NAMESPACE}/${ownerId}/${filename}`;
}

export function isPrivateHrUploadKey(key: string): boolean {
  return key.split('/')[3] === HR_DOCUMENT_NAMESPACE;
}

/** Read the uploader from a canonical tenant/year/month HR document key. */
export function hrUploadOwner(key: string): string | null {
  const parts = key.split('/');
  if (
    parts.length !== 6 ||
    !safeSegment(parts[0]) ||
    !/^\d{4}$/.test(parts[1]) ||
    !/^(0[1-9]|1[0-2])$/.test(parts[2]) ||
    parts[3] !== HR_DOCUMENT_NAMESPACE ||
    !safeSegment(parts[4]) ||
    !parts[5] ||
    parts[5] === '.' ||
    parts[5] === '..' ||
    /[\\\0\r\n?#]/.test(parts[5])
  )
    return null;
  return parts[4];
}
