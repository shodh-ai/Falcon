'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';

export default function RequisitionsPage() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('400000');
  const [specs, setSpecs] = useState('');

  const reload = () =>
    ops.requisitions().then(setRows).catch(() => toast.error('Failed to load PRs'));

  useEffect(() => {
    void reload();
  }, [ops]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Purchase Requisitions</h1>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Requestor (Maker) role: raise the need and technical specs only. Central Procurement
        sources quotes and vendors — you cannot select vendors or pay.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>New purchase request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="High-Speed Oscilloscope for Tokamak Labs"
          />
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            placeholder="Amount estimate ₹"
          />
          <Input
            value={specs}
            onChange={(e) => setSpecs(e.target.value)}
            placeholder="Technical specs (bandwidth, channels…)"
          />
          <Button
            onClick={() =>
              ops
                .createRequisition({
                  description,
                  amount_estimate: Number(amount),
                  technical_specs: specs || undefined,
                })
                .then((pr) => {
                  toast.success(
                    `PR submitted → Procurement (expected DOFA L${pr.expected_dofa_level?.level_no ?? '?'})`,
                  );
                  setDescription('');
                  setSpecs('');
                  return reload();
                })
                .catch((e) => toast.error(String(e?.message ?? e)))
            }
          >
            Submit to Procurement
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My / open PRs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {rows.map((r) => (
            <div key={r.pr_id} className="border rounded-md p-3">
              <div className="font-medium">{r.description}</div>
              <div className="text-muted-foreground">
                ₹{Number(r.amount_estimate).toLocaleString('en-IN')} · {r.status}
                {r.required_level ? ` · DOFA L${r.required_level}` : ''}
              </div>
            </div>
          ))}
          {!rows.length && <p className="text-muted-foreground">No requisitions yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
