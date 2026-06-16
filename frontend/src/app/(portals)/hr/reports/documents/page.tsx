'use client';

import { useEffect, useState } from 'react';
import { Archive, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useAuth } from '@/context/AuthContext';
import {
  HR_DOCUMENT_CATEGORIES,
  downloadExportJob,
  type ExportJobStatus,
} from '@/lib/api/api.hr-documents';

const EXPORT_DOC_OPTIONS = ['ALL', ...HR_DOCUMENT_CATEGORIES] as const;

type Role = { role_id: number; role_name: string };
type Dept = { dept_id: number; dept_name: string };

export default function HrDocumentExportPage() {
  const api = useHrApi();
  const { token } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [documentType, setDocumentType] = useState('AADHAAR');
  const [deptId, setDeptId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<ExportJobStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    void api
      .get<{ roles: Role[]; departments: Dept[] }>('/api/hr/metadata/roles-departments')
      .then((data) => {
        setRoles(data.roles);
        setDepartments(data.departments);
      })
      .catch(() => {});
  }, [api]);

  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(() => {
      void api
        .get<ExportJobStatus>(`/api/hr/documents/export-jobs/${jobId}`)
        .then((status) => {
          setJobStatus(status);
          if (status.status === 'COMPLETED' && status.download_url) {
            clearInterval(interval);
            toast.success('Export ready — download from notification or below');
          }
          if (status.status === 'FAILED') {
            clearInterval(interval);
            toast.error(status.error_message ?? 'Export failed');
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [api, jobId]);

  async function generateArchive() {
    setSubmitting(true);
    setJobStatus(null);
    try {
      const result = await api.post<{ job_id: string; message: string; document_count?: number }>(
        '/api/hr/documents/bulk-export',
        {
          document_type: documentType,
          dept_id: deptId ? Number(deptId) : undefined,
          role_id: roleId ? Number(roleId) : undefined,
        },
      );
      setJobId(result.job_id);
      const label =
        documentType === 'ALL' ? 'documents' : `${documentType.replace(/_/g, ' ')} cards`;
      toast.success(
        `ZIP Generation Started. Compiling ${result.document_count ?? 0} ${label}… Check the bell icon when ready.`,
      );
      window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to queue export');
    } finally {
      setSubmitting(false);
    }
  }

  const isGenerating =
    submitting || (jobId != null && jobStatus?.status !== 'COMPLETED' && jobStatus?.status !== 'FAILED');

  return (
    <>
      <HrPageHeader
        title="Bulk Document Export"
        description="Filter employees by department and document type, then generate a secure ZIP archive asynchronously."
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Archive className="h-5 w-5 text-sgvu-gold" />
            Export filters
          </CardTitle>
          <CardDescription>
            Example: Department CSE + Document AADHAAR → ZIP of all matching identity cards.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Department</label>
            <select
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.dept_id} value={d.dept_id}>
                  {d.dept_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Role</label>
            <select
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
            >
              <option value="">All roles</option>
              {roles.map((r) => (
                <option key={r.role_id} value={r.role_id}>
                  {r.role_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Document type</label>
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

          <Button className="w-full" disabled={isGenerating} onClick={() => void generateArchive()}>
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Archive…
              </>
            ) : (
              'Generate Bulk Archive (ZIP)'
            )}
          </Button>

          {isGenerating && (
            <p className="text-sm text-muted-foreground">
              Generating archive… You will receive a notification when it&apos;s ready.
            </p>
          )}

          {jobStatus?.status === 'COMPLETED' && jobId && token && (
            <Button
              variant="outline"
              className="w-full"
              disabled={downloading}
              onClick={() => {
                setDownloading(true);
                void downloadExportJob(token, jobId)
                  .then((fresh) => setJobStatus(fresh))
                  .catch((e) => toast.error(e instanceof Error ? e.message : 'Download failed'))
                  .finally(() => setDownloading(false));
              }}
            >
              {downloading ? 'Preparing download…' : `Download ${jobStatus.file_name ?? 'archive.zip'}`}
            </Button>
          )}

          {jobStatus?.status === 'FAILED' && (
            <p className="text-sm text-destructive">{jobStatus.error_message}</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
