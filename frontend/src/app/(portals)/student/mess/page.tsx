'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type Wallet = { wallet_id: string; current_balance: string };
type CatalogItem = { item_id: string; item_name: string; price: string; meal_type: string };
type QrPayload = { qr_payload: string; expires_at: string };

export default function StudentMessPage() {
  const api = useAuthedApi();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('500');

  const load = () => {
    void api.get<Wallet>('/api/campus-wallet/me').then(setWallet);
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
      await api.post('/api/campus-wallet/top-up', {
        amount: Number(topUpAmount),
        reference_id: `UPI-${Date.now()}`,
      });
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
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title="Smart Mess & Campus Wallet"
        description="Top up via UPI, pre-order add-ons, and show a dynamic QR at the mess counter."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Falcon Pay balance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <p className="text-2xl font-bold">₹{Number(wallet?.current_balance ?? 0).toFixed(2)}</p>
          <Input type="number" className="w-28" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} />
          <Button onClick={() => void topUp()}>Top up (mock UPI)</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dynamic mess QR (refreshes every 30s)</CardTitle>
        </CardHeader>
        <CardContent className="font-mono text-xs break-all">
          {qr?.qr_payload ?? 'Generating…'}
          {qr && <p className="mt-2 text-muted-foreground">Expires {new Date(qr.expires_at).toLocaleTimeString()}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add-on menu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {catalog.map((item) => (
            <div key={item.item_id} className="flex items-center justify-between rounded border p-3 text-sm">
              <div>
                <p className="font-medium">{item.item_name}</p>
                <p className="text-muted-foreground">₹{item.price} · {item.meal_type}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void preOrder(item)}>
                Pre-order
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
