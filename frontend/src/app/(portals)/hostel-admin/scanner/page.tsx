'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

export default function MessScannerPage() {
  const api = useAuthedApi();
  const [qr, setQr] = useState('');
  const [result, setResult] = useState<{ student_name: string; addons: string[]; status: string } | null>(null);

  async function scan() {
    try {
      const res = await api.post<typeof result>('/api/campus-wallet/mess/scan', { qr_payload: qr });
      setResult(res);
      toast.success('Valid meal pass');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid QR');
      setResult(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-2xl font-bold">Mess Scanner</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan student QR</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Paste QR payload" value={qr} onChange={(e) => setQr(e.target.value)} />
          <Button onClick={() => void scan()}>Validate & serve</Button>
          {result && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm">
              <p className="font-bold text-emerald-800">{result.status} — {result.student_name}</p>
              <p className="mt-2">Serve: Standard meal + {result.addons.join(', ') || 'no add-ons'}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
