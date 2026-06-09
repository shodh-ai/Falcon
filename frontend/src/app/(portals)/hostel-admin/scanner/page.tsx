'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type MealPassResult = {
  student_name: string;
  display_line?: string;
  meal_type?: string;
  status: string;
  room?: string;
};

type OrderRedeemResult = {
  message: string;
  student_name: string;
  item_name: string;
  status: string;
  burned?: boolean;
};

export default function MessScannerPage() {
  const api = useAuthedApi();
  const [mealQr, setMealQr] = useState('');
  const [mealResult, setMealResult] = useState<MealPassResult | null>(null);

  const [orderInput, setOrderInput] = useState('');
  const [orderResult, setOrderResult] = useState<OrderRedeemResult | null>(null);

  async function scanMealPass() {
    try {
      const res = await api.post<MealPassResult>('/api/campus-wallet/mess/scan', { qr_payload: mealQr });
      setMealResult(res);
      toast.success(`${res.meal_type ?? 'Meal'} entry logged`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid meal pass');
      setMealResult(null);
    }
  }

  async function redeemOrder() {
    try {
      const res = await api.post<OrderRedeemResult>('/api/mess/redeem-order', {
        claim_pin_or_qr: orderInput,
      });
      setOrderResult(res);
      toast.success('Order ticket burnt — serve item');
      setOrderInput('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Redemption failed');
      setOrderResult(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Mess Worker Tablet</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Master Meal Pass — Buffet entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Scan the student&apos;s rotating QR for standard breakfast / lunch / dinner buffet. Verifies hostel allocation and logs one entry per meal.
          </p>
          <Input placeholder="Paste rotating meal pass QR" value={mealQr} onChange={(e) => setMealQr(e.target.value)} />
          <Button onClick={() => void scanMealPass()}>Verify buffet entry</Button>
          {mealResult && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm">
              <p className="font-bold text-emerald-800">{mealResult.status} — {mealResult.student_name}</p>
              <p className="mt-2 font-semibold text-emerald-900">{mealResult.display_line}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add-on Order Ticket — Burn &amp; serve</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Scan the static order QR or type the 4-digit PIN (e.g. 4928) for pre-orders like Midnight Maggi. Ticket is burnt after one use.
          </p>
          <Input
            placeholder="PIN or order QR (FALCON:ORDER:…)"
            value={orderInput}
            onChange={(e) => setOrderInput(e.target.value)}
          />
          <Button variant="secondary" onClick={() => void redeemOrder()}>
            Redeem &amp; burn ticket
          </Button>
          {orderResult && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
              <p className="font-bold text-amber-900">{orderResult.status} — Ticket burnt</p>
              <p className="mt-2 font-semibold text-amber-950">{orderResult.message}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
