'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Download, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { downloadExportJob, fetchExportJobStatus, type ExportJobStatus } from '@/lib/api/api.hr-documents';

export default function HrExportJobDownloadPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const [status, setStatus] = useState<ExportJobStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoDownloadAttempted = useRef(false);

  useEffect(() => {
    if (!token || !jobId) return;
    let cancelled = false;
    let interval: number | undefined;
    autoDownloadAttempted.current = false;

    async function checkStatus() {
      try {
        const result = await fetchExportJobStatus(token!, jobId);
        if (!cancelled) {
          setStatus(result);
          setError(result.status === 'FAILED' ? result.error_message ?? 'Export failed' : null);
          if ((result.status === 'COMPLETED' || result.status === 'FAILED') && interval !== undefined) {
            window.clearInterval(interval);
          }
          if (result.status === 'COMPLETED' && !autoDownloadAttempted.current) {
            autoDownloadAttempted.current = true;
            setDownloading(true);
            try {
              await downloadExportJob(token!, jobId);
              if (!cancelled) toast.success('ZIP download started');
            } catch (caught) {
              if (!cancelled) setError(caught instanceof Error ? caught.message : 'Download failed');
            } finally {
              if (!cancelled) setDownloading(false);
            }
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not check export status');
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void checkStatus();
    interval = window.setInterval(() => {
      if (!cancelled) void checkStatus();
    }, 3000);
    return () => {
      cancelled = true;
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [token, jobId]);

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-5 w-5 text-sgvu-gold" />
            Document export
          </CardTitle>
          <CardDescription>
            {checking || downloading
              ? 'Checking your ZIP archive…'
              : status?.status === 'COMPLETED'
                ? 'Your download should begin automatically.'
                : status?.status === 'FAILED'
                  ? 'The export failed.'
                  : 'The export is processing. This page updates automatically.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(checking || downloading) && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {downloading ? 'Fetching secure download…' : 'Checking export status…'}
            </p>
          )}
          {status && <p className="text-sm">Status: {status.status.toLowerCase()}</p>}
          {status?.skipped_count ? (
            <p className="text-sm text-amber-800">
              {status.skipped_count} document(s) were unavailable. The ZIP contains an
              <code className="mx-1">unavailable-documents.json</code>
              manifest with the reasons.
            </p>
          ) : null}
          {status?.status === 'COMPLETED' && status.error_message && (
            <p className="text-sm text-amber-800">{status.error_message}</p>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {status?.file_name && !error && (
            <p className="text-sm text-muted-foreground">File: {status.file_name}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push('/hr/directory')}>
              Back to directory
            </Button>
            {token && jobId && status?.status === 'COMPLETED' && (
              <Button
                disabled={downloading}
                onClick={() => {
                  setDownloading(true);
                  setError(null);
                  void downloadExportJob(token, jobId)
                    .then(setStatus)
                    .catch((e) => setError(e instanceof Error ? e.message : 'Download failed'))
                    .finally(() => setDownloading(false));
                }}
              >
                {downloading ? 'Preparing…' : 'Download ZIP again'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
