'use client';

import { AlertTriangle, Database, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExamCellDev } from '@/lib/exam-cell/dev-context';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

export function ExamCellDevBanner() {
  const dev = useExamCellDev();
  const api = useAuthedApi();

  if (!dev?.usingFallback) return null;

  async function bootstrapDb() {
    try {
      const res = await api.post<{ message?: string; summary?: Record<string, unknown> }>('/api/exam-cell/dev/bootstrap', {});
      toast.success(res.message ?? 'Sample examination data created in database');
      dev?.clearFallbackState();
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bootstrap failed — seed data is still shown in the UI');
    }
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Development mode — showing sample examination data</p>
            <p className="text-xs text-amber-800/90">
              The live API is unavailable or returned an error ({dev.fallbackCount} request{dev.fallbackCount === 1 ? '' : 's'}).
              Pages remain usable with realistic seed data. Restart the backend after <code className="rounded bg-amber-100 px-1">npm run build</code> in{' '}
              <code className="rounded bg-amber-100 px-1">Falcon/backend</code> to use live data.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-8 border-amber-300 bg-white" onClick={() => void bootstrapDb()}>
            <Database className="mr-1.5 h-3.5 w-3.5" />
            Create sample data in DB
          </Button>
          <Button size="sm" variant="outline" className="h-8 border-amber-300 bg-white" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Retry live API
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={dev.dismissBanner} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
