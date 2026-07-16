'use client';

import { Database, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  showBootstrap?: boolean;
};

export function ExamCellEmptyState({
  title = 'No examination records found',
  message = 'There are no records for the current filters. Create sample data to explore the module, or add a new record.',
  onRetry,
  showBootstrap = true,
}: Props) {
  const api = useAuthedApi();

  async function bootstrap() {
    try {
      const res = await api.post<{ message?: string }>('/api/exam-cell/dev/bootstrap', {});
      toast.success(res.message ?? 'Sample data created');
      onRetry?.();
      if (!onRetry) window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create sample data');
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-12 text-center">
      <p className="text-base font-semibold text-sgvu-navy">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {showBootstrap ? (
          <Button variant="outline" size="sm" onClick={() => void bootstrap()}>
            <Database className="mr-2 h-4 w-4" />
            Create sample data
          </Button>
        ) : null}
        {onRetry ? (
          <Button size="sm" onClick={onRetry}>
            <Plus className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        ) : null}
      </div>
    </div>
  );
}
