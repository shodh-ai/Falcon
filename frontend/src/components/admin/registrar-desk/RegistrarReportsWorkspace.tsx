'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  REG_BRAND_BTN,
  REG_OUTLINE_BTN,
  RegistrarDeskChrome,
} from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { REGISTRAR_DESK } from '@/lib/api/api.registrar-desk';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthedApi } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type Summary = {
  enrollment_active: number;
  graduated_alumni: number;
  pending_registrations: number;
  status_breakdown: Array<{ status: string; count: number }>;
  department_stats: Array<{ department: string; count: number }>;
  certificate_stats: Array<{ certificate_type: string; status: string; count: number }>;
};

export function RegistrarReportsWorkspace() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const summary = await api.get<Summary>(REGISTRAR_DESK.reportsSummary);
      setData(summary);
    } catch (e) {
      toast.error('Could not load reports', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportReport(format: 'csv' | 'pdf') {
    if (!token) {
      toast.warning('Sign in again to export reports');
      return;
    }
    try {
      const response = await fetch(`${getApiBaseUrl()}${REGISTRAR_DESK.reportsExport(format)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `registrar-reports.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`${format.toUpperCase()} export ready`);
    } catch (e) {
      toast.error('Export failed', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
    }
  }

  const maxDept = Math.max(1, ...(data?.department_stats ?? []).map((d) => d.count));

  return (
    <RegistrarDeskChrome
      title="Registrar Reports"
      subtitle="Enrollment, admissions lifecycle, graduation, approvals, department and certificate analytics."
    >
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={cn('h-10 rounded-lg px-4 text-sm font-semibold', REG_BRAND_BTN)}
          onClick={() => void exportReport('csv')}
        >
          CSV export
        </button>
        <button
          type="button"
          className={cn('h-10 rounded-lg px-4 text-sm font-semibold', REG_OUTLINE_BTN)}
          onClick={() => void exportReport('pdf')}
        >
          PDF export
        </button>
        <button type="button" className={cn('h-10 rounded-lg px-4 text-sm font-semibold', REG_OUTLINE_BTN)} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading reports…
        </div>
      ) : !data ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Unable to load report summary.</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Enrollment report', value: data.enrollment_active },
              { label: 'Graduation report', value: data.graduated_alumni },
              { label: 'Pending approvals', value: data.pending_registrations },
              {
                label: 'Lifecycle statuses',
                value: (data.status_breakdown ?? []).length,
              },
            ].map((item) => (
              <Card key={item.label} className="border-sgvu-navy/10 bg-white shadow-sm">
                <CardContent className="p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-1 text-3xl font-bold text-sgvu-navy">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-sgvu-navy/10 bg-white shadow-sm">
              <CardHeader className="border-b border-sgvu-navy/10 pb-3">
                <CardTitle className="text-base font-bold text-sgvu-navy">Student status report</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.status_breakdown ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="py-10 text-center text-muted-foreground">
                          No status data
                        </TableCell>
                      </TableRow>
                    ) : (
                      (data.status_breakdown ?? []).map((r) => (
                        <TableRow key={r.status}>
                          <TableCell>{String(r.status).replace(/_/g, ' ')}</TableCell>
                          <TableCell className="text-right font-semibold text-sgvu-navy">{r.count}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-sgvu-navy/10 bg-white shadow-sm">
              <CardHeader className="border-b border-sgvu-navy/10 pb-3">
                <CardTitle className="text-base font-bold text-sgvu-navy">Department statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {(data.department_stats ?? []).length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No department data</p>
                ) : (
                  (data.department_stats ?? []).map((d) => (
                    <div key={d.department}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-sgvu-navy">{d.department}</span>
                        <span className="font-semibold">{d.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-[#0B2447]"
                          style={{ width: `${(d.count / maxDept) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardHeader className="border-b border-sgvu-navy/10 pb-3">
              <CardTitle className="text-base font-bold text-sgvu-navy">Certificate report</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.certificate_stats ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                        No certificate activity yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    (data.certificate_stats ?? []).map((r, i) => (
                      <TableRow key={`${r.certificate_type}-${r.status}-${i}`}>
                        <TableCell>{r.certificate_type.replace(/_/g, ' ')}</TableCell>
                        <TableCell>{r.status}</TableCell>
                        <TableCell className="text-right font-semibold">{r.count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </RegistrarDeskChrome>
  );
}
