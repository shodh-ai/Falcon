'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuth } from '@/context/AuthContext';
import { canRoleAccessPath } from '@/lib/auth-routing';

export default function Page() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [poId, setPoId] = useState('');
  const [photoPath, setPhotoPath] = useState('');
  const [challanPath, setChallanPath] = useState('');
  const [barcode, setBarcode] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const role = user?.primaryRole ?? user?.role;
  const canAccessGrn = canRoleAccessPath(
    user?.roles?.length ? user.roles : role,
    '/finance/grn',
    user?.hr_capabilities,
    user?.permissions,
    user?.email,
  );

  const reload = useCallback(async () => {
    if (!canAccessGrn) {
      setRows([]);
      setPos([]);
      setLoadError('forbidden');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [grnResult, poResult] = await Promise.allSettled([
        ops.grns(),
        ops.purchaseOrders(),
      ]);

      if (grnResult.status === 'rejected') {
        throw grnResult.reason;
      }

      setRows(grnResult.value);
      if (poResult.status === 'fulfilled') {
        setPos(poResult.value.filter((x: any) => x.status === 'APPROVED'));
      } else {
        setPos([]);
      }
      setLoadError(null);
    } catch (e: unknown) {
      setRows([]);
      setPos([]);
      const msg = String((e as Error)?.message ?? e);
      setLoadError(msg);
      if (!/forbidden/i.test(msg)) {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [canAccessGrn, ops]);

  useEffect(() => {
    void reload();
  }, [reload]);

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

  if (!canAccessGrn) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-2xl font-black text-sgvu-navy">Central Stores — GRN</h1>
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Goods receipt is for gatekeepers only. Sign in as{' '}
          <span className="font-mono">stores@mygyanvihar.com</span> (password{' '}
          <span className="font-mono">password123</span>), then return here.
        </div>
        <Link href="/finance/ap-desk" className="text-sm underline text-sgvu-navy">
          Back to AP Desk
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Central Stores — GRN</h1>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Gatekeepers only: open the box, photograph it, tag with SGVU barcode, upload delivery
        challan. The requestor cannot click Received.
      </p>

      {loadError && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {/forbidden/i.test(loadError)
            ? 'Could not load GRN data — confirm you are signed in as Central Stores.'
            : loadError}
        </div>
      )}

      {loading && !loadError && (
        <p className="text-sm text-muted-foreground">Loading approved POs…</p>
      )}

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
              void ops
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
