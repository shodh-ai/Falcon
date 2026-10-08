'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

const PLAYBOOK = [
  { step: '6.1', label: 'Ops Dashboard', href: '/operations/dashboard', note: 'You are here' },
  { step: '6.2', label: 'QR Ticketing', href: '/operations/qr-tickets', note: 'Create ticket from QR' },
  { step: '6.3', label: 'ESM Queues', href: '/operations/esm', note: 'Scan-close open ticket' },
  { step: '6.4', label: 'P2P Oversight', href: '/operations/p2p', note: 'PO → GRN → Invoice → Pay' },
  { step: '6.5', label: 'Vendor Penalties', href: '/operations/penalties', note: 'Apply SLA penalty (COO)' },
  {
    step: '6.6',
    label: 'Executive BI (Chairman)',
    href: '/leadership/overview',
    note: 'Overview → Intelligence → Action Center → Admissions Funnel',
  },
];

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    void ops.dashboard().then(setD).catch(() => toast.error('Load failed'));
  }, [ops]);

  const tiles: { label: string; value: number; href: string }[] = [
    { label: 'ESM SLA Breaches', value: d?.esm_sla_breaches ?? 0, href: '/operations/esm' },
    { label: 'Open POs', value: d?.open_pos ?? 0, href: '/operations/p2p' },
    { label: 'Pending GRN', value: d?.pending_grn ?? 0, href: '/operations/p2p' },
    { label: 'Vendor Penalties', value: d?.vendor_penalties_count ?? 0, href: '/operations/penalties' },
    { label: 'Lab Checkouts', value: d?.lab_active_checkouts ?? 0, href: '/labs/dashboard' },
    { label: 'Fellowship Trials', value: d?.fellowship_trials ?? 0, href: '/research/fellowships' },
    {
      label: 'Golden Tickets',
      value: d?.challenge_funnel?.golden ?? 0,
      href: '/competitions/funnel',
    },
  ];

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">COO Operations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track 6 — Institutional Overhaul manual test playbook
        </p>
      </div>
      <Card className="border-sgvu-gold/40 bg-sgvu-gold/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Test playbook (6.x)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {PLAYBOOK.map((s) => (
            <div key={`${s.step}-${s.href}`} className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xs text-muted-foreground">{s.step}</span>
              <Link href={s.href} className="font-medium text-sgvu-navy underline">
                {s.label}
              </Link>
              <span className="text-muted-foreground">— {s.note}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href}>
            <Card className="transition hover:border-sgvu-gold/60 hover:shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{tile.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold text-sgvu-navy">{tile.value}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
