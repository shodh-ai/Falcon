import { getApiBaseUrl } from '@/lib/api-base-url';
import { getSubdomainFromClient } from '@/lib/tenant';

function isZipExcel(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export async function downloadAuthedFile(
  path: string,
  token: string,
  filename: string,
) {
  const url = `${getApiBaseUrl()}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-subdomain': getSubdomainFromClient(),
    },
  });

  const bytes = new Uint8Array(await res.arrayBuffer());

  if (!res.ok) {
    const text = new TextDecoder().decode(bytes.slice(0, 500));
    throw new Error(text || 'Download failed');
  }

  if (!isZipExcel(bytes)) {
    const preview = new TextDecoder().decode(bytes.slice(0, 300)).trim();
    throw new Error(
      preview
        ? `Server did not return a valid Excel file: ${preview}`
        : 'Server did not return a valid Excel file. Try signing in again or restart the backend.',
    );
  }

  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}
