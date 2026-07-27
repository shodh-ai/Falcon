'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

function writeoffStatusLabel(status?: string) {
  if (status === 'WRITTEN_OFF') return 'Written off';
  if (status === 'REJECTED') return 'Rejected';
  if (status === 'PENDING_DOFA') return 'Awaiting COO → CFO approval';
  return status ?? 'Unknown';
}

export default function AssetLifecyclePage() {
  const api = useAuthedApi();
  const [assets, setAssets] = useState<any[]>([]);
  const [writeoffs, setWriteoffs] = useState<any[]>([]);
  const [cals, setCals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const reload = () =>
    Promise.all([
      api.get<any[]>('/api/admin-ops/assets').catch(() => []),
      api.get<any[]>('/api/uos/assets/writeoffs').catch(() => []),
      api.get<any[]>('/api/uos/assets/calibrations').catch(() => []),
    ]).then(([a, w, c]) => {
      setAssets(Array.isArray(a) ? a : []);
      setWriteoffs(Array.isArray(w) ? w : []);
      setCals(Array.isArray(c) ? c : []);
    });

  useEffect(() => {
    void reload().finally(() => setLoading(false));
  }, [api]);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Asset Lifecycle (ALM)</h1>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Request a write-off here → <strong>COO</strong> approves at{' '}
        <Link href="/operations/approvals/dofa-inbox" className="underline">
          Operations DOFA inbox
        </Link>{' '}
        → <strong>CFO</strong> final approve at{' '}
        <Link href="/finance/approvals/dofa-inbox" className="underline">
          Finance DOFA inbox
        </Link>
        . You cannot approve your own request.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            api
              .post('/api/uos/assets/calibrations/run-alerts')
              .then((r: any) => toast.success(`Alerted ${r.alerted ?? 0}`))
              .catch((e) => toast.error(String(e?.message ?? e)))
          }
        >
          Run calibration → ESM
        </Button>
      </div>
      <section>
        <h2 className="font-semibold mb-2">Assets</h2>
        {loading && <p className="text-sm text-muted-foreground">Loading assets…</p>}
        {!loading && !assets.length && (
          <p className="text-sm text-muted-foreground">No assets available to write off.</p>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-muted-foreground text-left">
              <th className="p-2">Tag</th>
              <th className="p-2">Name</th>
              <th className="p-2">Status</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {assets
              .filter((a) => a.status !== 'WRITTEN_OFF')
              .slice(0, 30)
              .map((a) => (
                <tr key={a.asset_id} className="border-b">
                  <td className="p-2">{a.asset_tag}</td>
                  <td className="p-2">{a.name}</td>
                  <td className="p-2">{a.status}</td>
                  <td className="p-2 space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={requestingId === a.asset_id}
                      onClick={() => {
                        setRequestingId(a.asset_id);
                        return api
                          .post('/api/uos/assets/writeoffs', {
                            asset_id: a.asset_id,
                            reason: 'End of life / unserviceable',
                          })
                          .then(() => {
                            toast.success('Write-off submitted — awaiting COO');
                            return reload();
                          })
                          .catch((e) => toast.error(String(e?.message ?? e)))
                          .finally(() => setRequestingId(null));
                      }}
                    >
                      {requestingId === a.asset_id ? 'Submitting…' : 'Write-off'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 3);
                        return api
                          .post('/api/uos/assets/calibrations', {
                            asset_id: a.asset_id,
                            next_due_at: d.toISOString().slice(0, 10),
                          })
                          .then(() => {
                            toast.success('Calibration scheduled');
                            return reload();
                          })
                          .catch((e) => toast.error(String(e?.message ?? e)));
                      }}
                    >
                      Schedule calib
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="font-semibold mb-2">Write-offs</h2>
        {!writeoffs.length && (
          <p className="text-sm text-muted-foreground">No write-off requests yet.</p>
        )}
        {writeoffs.map((w) => (
          <div key={w.writeoff_id} className="border-b py-2 text-sm">
            <div className="font-medium">{w.asset_name ?? w.asset_tag}</div>
            <div className="text-muted-foreground">{writeoffStatusLabel(w.status)}</div>
            {w.reason ? <div className="text-xs mt-0.5">{w.reason}</div> : null}
          </div>
        ))}
      </section>
      <section>
        <h2 className="font-semibold mb-2">Calibrations</h2>
        <p className="text-sm text-muted-foreground">{cals.length} scheduled/alerted</p>
      </section>
    </div>
  );
}
