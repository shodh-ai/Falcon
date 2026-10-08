'use client';

import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

const DATASETS = ['admissions', 'faculty_workload', 'attendance_analytics', 'finance_collections', 'placement_stats'];

export default function ReportsWarehousePage() {
  const api = useAuthedApi();

  async function exportDataset(key: string) {
    try {
      const data = await api.get<{ rows: unknown[] }>(`/api/reports/warehouse/${key}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `falcon-${key}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success('Export ready', { description: `${key.replace(/_/g, ' ')} downloaded.` });
    } catch (error) {
      toast.error('Export failed', {
        description: error instanceof Error ? error.message : 'Could not export dataset.',
      });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Central Report Builder</h1>
      <p className="text-sm text-muted-foreground">
        Secure data warehouse exports for Power BI / Tableau — real-time JSON feeds per dataset.
      </p>
      <div className="grid gap-2">
        {DATASETS.map((key) => (
          <Button key={key} variant="outline" className="justify-start" onClick={() => void exportDataset(key)}>
            Export {key.replace(/_/g, ' ')}
          </Button>
        ))}
      </div>
    </div>
  );
}
