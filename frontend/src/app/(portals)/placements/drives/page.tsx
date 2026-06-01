'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

export default function PlacementDrivesPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const load = () => void api.get('/api/placement/drives').then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
  }, [api]);

  async function checkEligibility(driveId: string) {
    try {
      const res = await api.get<{ eligible: boolean; reason?: string }>(`/api/placement/drives/${driveId}/eligibility`);
      toast.message(res.eligible ? 'You are eligible to apply' : res.reason ?? 'Not eligible');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Check failed');
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Placement Drives</h1>
      <ul className="mt-4 space-y-3 text-sm">
        {rows.map((d) => (
          <li key={String(d.drive_id)} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3">
            <div>
              <p className="font-semibold">
                {String(d.company_name)} — {String(d.job_profile)}
              </p>
              <p className="text-muted-foreground">
                Min CGPA {String(d.min_cgpa)} · Max backlogs {String(d.max_backlogs)} · {String(d.package_details_lpa)} LPA
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void checkEligibility(String(d.drive_id))}>
              Check eligibility
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
