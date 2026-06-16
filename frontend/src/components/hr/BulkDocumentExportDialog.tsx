'use client';

import { useEffect, useState } from 'react';
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
import { HR_DOCUMENT_CATEGORIES } from '@/lib/api/api.hr-documents';

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

  useEffect(() => {
    if (!open) return;
    void api
      .get<{ roles: unknown[]; departments: Dept[] }>('/api/hr/metadata/roles-departments')
      .then((data) => setDepartments(data.departments))
      .catch(() => {});
  }, [api, open]);

  function pollExportJob(jobId: string) {
    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      void api
        .get<{ status: string; error_message?: string | null }>(
          `/api/hr/documents/export-jobs/${jobId}`,
        )
        .then((job) => {
          if (job.status === 'COMPLETED') {
            clearInterval(interval);
            window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
          }
          if (job.status === 'FAILED') {
            clearInterval(interval);
            toast.error(job.error_message ?? 'Export failed');
            window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
          }
        })
        .catch(() => {});
      if (attempts >= 40) clearInterval(interval);
    }, 3000);
  }

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
      setOpen(false);
      const count = result.document_count ?? 0;
      const label = documentLabel(documentType);
      toast.success(
        `ZIP Generation Started. Compiling ${count} ${label}… You will be notified via the Bell Icon when your file is ready.`,
      );
      window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
      pollExportJob(result.job_id);
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
            <select
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
            >
              {EXPORT_DOC_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c === 'ALL' ? 'ALL — every document type' : c.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Department (optional)</label>
            <select
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
            </select>
          </div>

          <Button className="w-full" disabled={submitting} onClick={() => void generateArchive()}>
            {submitting ? 'Starting…' : 'Generate ZIP Archive'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
