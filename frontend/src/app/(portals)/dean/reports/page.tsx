'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { getSubdomainFromClient } from '@/lib/tenant';
import {
  DeanFilterBar,
  buildDeanFilterQuery,
  type DeanFilterValues,
} from '@/components/dean/DeanFilterBar';

const REPORT_TYPES = [
  { id: 'all', label: 'School Summary' },
  { id: 'department', label: 'Department Summary' },
  { id: 'faculty', label: 'Faculty Summary' },
  { id: 'placement', label: 'Placement Report' },
  { id: 'research', label: 'Research Report' },
  { id: 'budget', label: 'Budget Report' },
];

export default function DeanReportsPage() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [filters, setFilters] = useState<DeanFilterValues>({});
  const [departments, setDepartments] = useState<Array<{ dept_id: number; dept_name: string }>>([]);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<Array<{ dept_id: number; dept_name: string }>>('/api/academics/dean/departments')
      .then((rows) => setDepartments(rows))
      .catch(() => setDepartments([]));
  }, [api]);

  const download = useCallback(
    async (type: string, format: 'excel' | 'csv' | 'pdf') => {
      if (!token) return;
      setExporting(`${type}-${format}`);
      try {
        const qs = buildDeanFilterQuery(filters);
        const url = `${getApiBaseUrl()}/api/academics/dean/intelligence/reports/export${qs}${qs ? '&' : '?'}type=${type}&format=${format}`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-subdomain': getSubdomainFromClient(),
          },
        });
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const ext = format === 'excel' ? 'xlsx' : format;
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = `dean-${type}-report.${ext}`;
        a.click();
        URL.revokeObjectURL(objectUrl);
        toast.success('Report downloaded');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Export failed');
      } finally {
        setExporting(null);
      }
    },
    [filters, token],
  );

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Executive Reports"
        description="Download school, department, faculty, placement, research, and budget reports."
        workspaceLabel="Dean Workspace"
      />

      <DeanFilterBar departments={departments} value={filters} onChange={setFilters} />

      <div className="grid gap-4 md:grid-cols-2">
        {REPORT_TYPES.map((report) => (
          <HodPanel key={report.id} title={report.label}>
            <div className="flex flex-wrap gap-2">
              {(['excel', 'csv', 'pdf'] as const).map((format) => (
                <Button
                  key={format}
                  size="sm"
                  variant="outline"
                  disabled={exporting === `${report.id}-${format}`}
                  onClick={() => void download(report.id, format)}
                >
                  {exporting === `${report.id}-${format}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {format.toUpperCase()}
                </Button>
              ))}
            </div>
          </HodPanel>
        ))}
      </div>
    </HodPageFrame>
  );
}
