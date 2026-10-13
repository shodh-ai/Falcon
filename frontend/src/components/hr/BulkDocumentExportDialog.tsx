'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useHrApi } from '@/lib/api/use-hr-api';
import { HR_DOCUMENT_CATEGORIES, type ExportJobStatus } from '@/lib/api/api.hr-documents';

type Dept = { dept_id: number; dept_name: string };

type ExportResponse = {
  job_id: string;
  document_count: number;
  message: string;
};

const EXPORT_DOC_OPTIONS = ['ALL', ...HR_DOCUMENT_CATEGORIES] as const;

function documentLabel(type: string): string {
  if (type === 'ALL') return 'documents';
  return `${type.replace(/_/g, ' ')} cards`;
}

export function BulkDocumentExportDialog() {
  const api = useHrApi();
  const [open, setOpen] = useState(false);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [documentType, setDocumentType] = useState<string>('AADHAAR');
  const [deptId, setDeptId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<ExportJobStatus | null>(null);

  useEffect(() => {
    if (!open) return;
    void api
      .get<{ roles: unknown[]; departments: Dept[] }>('/api/hr/metadata/roles-departments')
      .then((data) => setDepartments(data.departments))
      .catch(() => {});
  }, [api, open]);

  useEffect(() => {
    if (!open || !job?.job_id || job.status === 'COMPLETED' || job.status === 'FAILED') return;
    let cancelled = false;
    const check = () => {
      void api
        .get<ExportJobStatus>(
          `/api/hr/documents/export-jobs/${job.job_id}`,
        )
        .then((updated) => {
          if (!cancelled) {
            setJob(updated);
            if (updated.status === 'COMPLETED' || updated.status === 'FAILED') {
              window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
            }
          }
        })
        .catch(() => {
          // A transient polling error is not a failed export; the tracking page remains available.
        });
    };
    const interval = window.setInterval(check, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [api, job?.job_id, job?.status, open]);

  async function generateArchive() {
    if (!documentType) {
      toast.error('Please select a document type');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post<ExportResponse>('/api/hr/documents/bulk-export', {
        document_type: documentType,
        dept_id: deptId ? Number(deptId) : undefined,
      });
      setJob({ job_id: result.job_id, status: 'QUEUED', document_count: result.document_count });
      const count = result.document_count ?? 0;
      const label = documentLabel(documentType);
      toast.success(
        `ZIP generation started for ${count} ${label}. Track it here or via the bell notification.`,
      );
      window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to queue export');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Archive className="mr-2 h-4 w-4" />
          Bulk Download Documents
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Employee Documents</DialogTitle>
          <DialogDescription>
            Generate a secure ZIP archive in the background. You&apos;ll get a bell notification when it&apos;s ready.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Document type <span className="text-destructive">*</span>
            </label>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Document type">
              {EXPORT_DOC_OPTIONS.map((c) => {
                const selected = documentType === c;
                return (
                  <Button
                    key={c}
                    type="button"
                    size="sm"
                    variant={selected ? 'default' : 'outline'}
                    aria-pressed={selected}
                    onClick={() => setDocumentType(c)}
                  >
                    {c === 'ALL' ? 'ALL' : c.replace(/_/g, ' ')}
                  </Button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Department (optional)</label>
            <Select
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
            >
              <option value="">ALL — all departments</option>
              {departments.map((d) => (
                <option key={d.dept_id} value={d.dept_id}>
                  {d.dept_name}
                </option>
              ))}
            </Select>
          </div>

          <Button className="w-full" disabled={submitting} onClick={() => void generateArchive()}>
            {submitting ? 'Starting…' : 'Generate ZIP Archive'}
          </Button>
          {job && (
            <div role="status" className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-semibold">Export {job.status.toLowerCase().replaceAll('_', ' ')}</p>
              {job.document_count !== undefined && <p>{job.document_count} document(s) selected</p>}
              {job.status === 'COMPLETED' && (job.skipped_count ?? 0) > 0 && (
                <p className="text-amber-800">{job.skipped_count} document(s) skipped. The ZIP contains an unavailable-documents.json manifest with reasons.</p>
              )}
              {job.status === 'COMPLETED' && job.error_message && <p className="text-amber-800">{job.error_message}</p>}
              {job.status === 'FAILED' && (
                <p role="alert" className="text-destructive">{job.error_message ?? 'Export failed. Try again or contact HR support.'}</p>
              )}
              <Button asChild size="sm" variant="outline">
                <Link href={`/hr/export-job/${job.job_id}`}>Track export and download ZIP</Link>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
