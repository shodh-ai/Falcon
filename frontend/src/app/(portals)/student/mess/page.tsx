'use client';

import { useEffect, useState } from 'react';
import { QrCode, UtensilsCrossed, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type WalletData = { wallet_id: string; current_balance: string };
type CatalogItem = { item_id: string; item_name: string; price: string; meal_type: string };
type QrPayload = { qr_payload: string; expires_at: string };

export default function StudentMessPage() {
  const api = useAuthedApi();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('500');

  const load = () => {
    void api.get<WalletData>('/api/campus-wallet/me').then(setWallet);
    void api.get<CatalogItem[]>('/api/campus-wallet/mess/catalog').then(setCatalog);
  };

  useEffect(() => {
    load();
  }, [api]);

  useEffect(() => {
    const refresh = () => {
      void api.get<QrPayload>('/api/campus-wallet/mess/qr').then(setQr).catch(() => undefined);
    };
    refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, [api]);

  async function topUp() {
    try {
      await api.post('/api/campus-wallet/top-up', { amount: Number(topUpAmount), reference_id: `UPI-${Date.now()}` });
      toast.success('Wallet topped up');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Top-up failed');
    }
  }

  async function preOrder(item: CatalogItem) {
    try {
      await api.post('/api/campus-wallet/mess/pre-order', {
        item_id: item.item_id,
        order_date: new Date().toISOString().slice(0, 10),
        meal_type: item.meal_type,
      });
      toast.success(`Pre-ordered ${item.item_name}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Order failed');
    }
  }

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Smart Mess & Campus Wallet"
        description="Top up via UPI, pre-order add-ons, and show a dynamic QR at the mess counter."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <StudentSectionCard title="Falcon Pay balance" description="Campus wallet for mess and add-ons" icon={Wallet} tone="gold">
          <StudentStatCard
            label="Available balance"
            value={`₹${Number(wallet?.current_balance ?? 0).toFixed(2)}`}
            helper="Use at mess counter or for pre-orders"
            className="mb-4 border-0 bg-transparent p-0 shadow-none hover:translate-y-0 hover:shadow-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Input type="number" className="w-32" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} />
            <Button onClick={() => void topUp()}>Top up (mock UPI)</Button>
          </div>
        </StudentSectionCard>

        <StudentSectionCard title="Dynamic mess QR" description="Refreshes every 30 seconds for secure check-in" icon={QrCode}>
          <div className="rounded-2xl border border-dashed border-sgvu-gold/40 bg-sgvu-gold/5 p-4 font-mono text-xs break-all">
            {qr?.qr_payload ?? 'Generating…'}
            {qr && <p className="mt-2 font-sans text-sm text-muted-foreground">Expires {new Date(qr.expires_at).toLocaleTimeString()}</p>}
          </div>
        </StudentSectionCard>
      </div>

      <StudentSectionCard title="Add-on menu" description="Pre-order meals and extras ahead of time" icon={UtensilsCrossed}>
        {catalog.length === 0 ? (
          <StudentEmptyState title="Menu unavailable" description="The add-on menu will appear when items are published." />
        ) : (
          <div className="space-y-3">
            {catalog.map((item) => (
              <div
                key={item.item_id}
                className="flex items-center justify-between rounded-2xl border border-border/70 bg-white p-4 text-sm transition hover:border-sgvu-gold/40"
              >
                <div>
                  <p className="font-semibold text-sgvu-navy">{item.item_name}</p>
                  <p className="text-muted-foreground">
                    ₹{item.price} · {item.meal_type}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void preOrder(item)}>
                  Pre-order
                </Button>
              </div>
            ))}
          </div>
        )}
      </StudentSectionCard>
    </StudentPageShell>
  );
}
