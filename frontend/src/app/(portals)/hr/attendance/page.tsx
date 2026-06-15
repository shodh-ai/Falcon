'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { HrAttendanceCalendar } from '@/components/hr/HrAttendanceCalendar';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

export default function HrAttendancePage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [syncing, setSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  async function syncBiometric() {
    setSyncing(true);
    try {
      await api.post('/api/hr/workforce/biometric/sync', {});
      toast.success('Biometric sync completed');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <HrPageHeader
        title="Attendance matrix"
        description="Color-coded daily status from assigned shifts, biometric punches, holidays, and pending requests."
        actions={
          <div className="flex gap-2">
            <input
              type="month"
              className="rounded-md border px-2 py-1 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <Button size="sm" variant="outline" disabled={syncing} onClick={() => void syncBiometric()}>
              {syncing ? 'Syncing…' : 'Sync biometric'}
            </Button>
            <Button 
              size="sm" 
              className="bg-sgvu-navy hover:bg-sgvu-navy/90 text-white" 
              onClick={() => {
                const token = document.cookie.replace(/(?:(?:^|.*;\s*)access_token\s*=\s*([^;]*).*$)|^.*$/, "$1");
                const url = new URL(`${window.location.origin}/api/hr/reports/muster-roll`);
                url.searchParams.set('month', month);
                if (entityId) url.searchParams.set('entity_id', String(entityId));
                
                fetch(url.toString(), {
                  headers: { Authorization: `Bearer ${token}` }
                })
                .then(res => res.blob())
                .then(blob => {
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `bulk-attendance-${month}.xlsx`;
                  a.click();
                });
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Bulk Export
            </Button>
          </div>
        }
      />

      <HrAttendanceCalendar
        key={`${entityId}-${month}-${refreshKey}`}
        mode="matrix"
        month={month}
        title={`Master matrix — ${month}`}
      />
    </>
  );
}
