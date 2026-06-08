'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { downloadExportJob, type ExportJobStatus } from '@/lib/api/api.hr-documents';

export default function HrExportJobDownloadPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const [status, setStatus] = useState<ExportJobStatus | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !jobId) return;
    let cancelled = false;

    async function run() {
      setDownloading(true);
      setError(null);
      try {
        const result = await downloadExportJob(token!, jobId);
        if (!cancelled) {
          setStatus(result);
          toast.success('Download started');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Download failed');
        }
      } finally {
        if (!cancelled) setDownloading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
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
            {downloading
              ? 'Preparing your ZIP archive…'
              : error
                ? 'We could not start the download.'
                : 'Your download should begin automatically.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {downloading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Fetching secure download link…
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {status?.file_name && !error && (
            <p className="text-sm text-muted-foreground">File: {status.file_name}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push('/hr/directory')}>
              Back to directory
            </Button>
            {token && jobId && (
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
                {downloading ? 'Preparing…' : 'Retry download'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
