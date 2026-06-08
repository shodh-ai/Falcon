import { API_URL } from './client';
import { getSubdomainFromClient } from '@/lib/tenant';

export const HR_DOCUMENT_CATEGORIES = [
  'AADHAAR',
  'PAN',
  'DEGREE',
  'TENTH_MARKSHEET',
  'TWELFTH_MARKSHEET',
  'VOID_CHEQUE',
  'OFFER_LETTER',
  'RELIEVING_LETTER',
  'ID_PHOTO',
  'OTHER',
] as const;

export type HrDocumentCategory = (typeof HR_DOCUMENT_CATEGORIES)[number];

export type VaultDocument = {
  document_id: string;
  document_type: string;
  file_name: string | null;
  verification_status: string;
  uploaded_at: string;
  uploaded_by_name?: string | null;
};

export type VaultResponse = {
  documents: VaultDocument[];
  groups: Record<string, VaultDocument[]>;
  categories: string[];
};

export type ExportJobStatus = {
  job_id: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  file_name?: string | null;
  error_message?: string | null;
  download_url?: string | null;
};

export const HR_EXPORT_JOB_LINK_PREFIX = '/hr/export-job/';

export function parseExportJobId(actionLink?: string | null): string | null {
  if (!actionLink) return null;
  const trimmed = actionLink.trim();
  const match = trimmed.match(/\/hr\/export-job\/([a-f0-9-]+)/i);
  return match?.[1] ?? null;
}

/** Fetch export job status and a fresh presigned download URL. */
export async function fetchExportJobStatus(token: string, jobId: string): Promise<ExportJobStatus> {
  const res = await fetch(`${API_URL}/api/hr/documents/export-jobs/${jobId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-subdomain': getSubdomainFromClient(),
    },
  });
  if (!res.ok) {
    let message = 'Export not ready yet';
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      const text = await res.text().catch(() => '');
      if (text) message = text;
    }
    throw new Error(message);
  }
  return (await res.json()) as ExportJobStatus;
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/** Fetch a completed export through the authenticated API and trigger a browser download. */
export async function downloadExportJob(token: string, jobId: string): Promise<ExportJobStatus> {
  const data = await fetchExportJobStatus(token, jobId);
  if (data.status === 'FAILED') {
    throw new Error(data.error_message ?? 'Export failed');
  }
  if (data.status !== 'COMPLETED') {
    throw new Error('Export is still processing. Try again shortly.');
  }

  const res = await fetch(`${API_URL}/api/hr/documents/export-jobs/${jobId}/download`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-subdomain': getSubdomainFromClient(),
    },
  });
  if (!res.ok) {
    let message = 'Download failed';
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      const text = await res.text().catch(() => '');
      if (text) message = text;
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  triggerBlobDownload(blob, data.file_name ?? 'export.zip');
  return data;
}
