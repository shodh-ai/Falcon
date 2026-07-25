'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [poId, setPoId] = useState('');
  const [photoPath, setPhotoPath] = useState('');
  const [challanPath, setChallanPath] = useState('');
  const [barcode, setBarcode] = useState('');

  const reload = () =>
    Promise.all([ops.grns(), ops.purchaseOrders()]).then(([g, p]) => {
      setRows(g);
      setPos(p.filter((x: any) => x.status === 'APPROVED'));
    });

  useEffect(() => {
    void reload().catch(() => toast.error('Load failed'));
  }, [ops]);

  async function upload(file: File, kind: 'photo' | 'challan') {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post<{ path?: string; file_path?: string }>('/api/uploads/single', form);
    const path = res.path ?? res.file_path;
    if (!path) throw new Error('Upload missing path');
    if (kind === 'photo') setPhotoPath(path);
    else setChallanPath(path);
    toast.success(`${kind} uploaded`);
  }

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Central Stores — GRN</h1>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Gatekeepers only: open the box, photograph it, tag with SGVU barcode, upload delivery
        challan. The requestor cannot click Received.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Receive at gate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <select
            className="w-full border rounded-md h-10 px-2"
            value={poId}
            onChange={(e) => setPoId(e.target.value)}
          >
            <option value="">Select approved PO…</option>
            {pos.map((p) => (
              <option key={p.po_id} value={p.po_id}>
                {p.description} — ₹{Number(p.amount).toLocaleString('en-IN')}
              </option>
            ))}
          </select>
          <Input
            placeholder="SGVU asset barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f, 'photo').catch((err) => toast.error(String(err?.message ?? err)));
              }}
            />
            <Input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void upload(f, 'challan').catch((err) => toast.error(String(err?.message ?? err)));
              }}
            />
          </div>
          <Button
            disabled={!poId || !photoPath || !challanPath || !barcode.trim()}
            onClick={() =>
              ops
                .createGrn({
                  po_id: poId,
                  photo_path: photoPath,
                  challan_path: challanPath,
                  asset_barcode: barcode.trim(),
                  received_at_gate: true,
                })
                .then(() => {
                  toast.success('GRN created');
                  setPoId('');
                  setPhotoPath('');
                  setChallanPath('');
                  setBarcode('');
                  return reload();
                })
                .catch((e) => toast.error(String(e?.message ?? e)))
            }
          >
            Mark received
          </Button>
        </CardContent>
      </Card>

      {rows.map((r) => (
        <Card key={r.grn_id}>
          <CardContent className="pt-4 text-sm">
            {r.po_description} — PO ₹{Number(r.po_amount).toLocaleString('en-IN')}
            {r.asset_barcode ? ` · barcode ${r.asset_barcode}` : ''}
            {r.photo_path ? ' · photo ✓' : ''}
            {r.challan_path ? ' · challan ✓' : ''}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
