'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function AssetLifecyclePage() {
  const api = useAuthedApi();
  const [assets, setAssets] = useState<any[]>([]);
  const [writeoffs, setWriteoffs] = useState<any[]>([]);
  const [cals, setCals] = useState<any[]>([]);

  const reload = () =>
    Promise.all([
      api.get<any[]>('/api/admin-ops/assets').catch(() => []),
      api.get<any[]>('/api/uos/assets/writeoffs').catch(() => []),
      api.get<any[]>('/api/uos/assets/calibrations').catch(() => []),
    ]).then(([a, w, c]) => {
      setAssets(a);
      setWriteoffs(w);
      setCals(c);
    });

  useEffect(() => {
    void reload();
  }, [api]);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Asset Lifecycle (ALM)</h1>
      <p className="text-sm text-muted-foreground">
        AMC, calibration alerts → ESM, and write-off DOFA (HOD → Estate/IT → Finance).
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
            {assets.slice(0, 30).map((a) => (
              <tr key={a.asset_id} className="border-b">
                <td className="p-2">{a.asset_tag}</td>
                <td className="p-2">{a.name}</td>
                <td className="p-2">{a.status}</td>
                <td className="p-2 space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      api
                        .post('/api/uos/assets/writeoffs', {
                          asset_id: a.asset_id,
                          reason: 'End of life / unserviceable',
                        })
                        .then(() => {
                          toast.success('Write-off requested');
                          return reload();
                        })
                        .catch((e) => toast.error(String(e?.message ?? e)))
                    }
                  >
                    Write-off
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
        {writeoffs.map((w) => (
          <div key={w.writeoff_id} className="flex items-center gap-2 border-b py-2 text-sm">
            <span>
              {w.asset_name} · {w.status}
            </span>
            <Button
              size="sm"
              onClick={() =>
                api
                  .post(`/api/uos/assets/writeoffs/${w.writeoff_id}/advance`, {})
                  .then(() => reload())
                  .catch((e) => toast.error(String(e?.message ?? e)))
              }
            >
              Advance DOFA
            </Button>
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
