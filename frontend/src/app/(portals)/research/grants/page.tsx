'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';

export default function ResearchGrantsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [proposals, setProposals] = useState<Record<string, unknown>[]>([]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('500000');
  const [agency, setAgency] = useState('SERB');

  const reload = () =>
    Promise.all([
      api.get<Record<string, unknown>[]>('/api/research/grants'),
      api.get<Record<string, unknown>[]>('/api/research/proposals'),
    ]).then(([g, p]) => {
      setRows(g);
      setProposals(p);
    });

  useEffect(() => {
    void reload().catch(() => {
      setRows([]);
      setProposals([]);
    });
  }, [api]);

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-xl font-bold text-sgvu-navy">RMS — Grants & Funding</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          External agency grants (DST/SERB/AICTE). Dean of Research must approve institutional
          commitment. Active grants gate P2P spend by category and available balance.
        </p>
      </div>

      <section className="rounded-lg border p-4 space-y-3 max-w-xl">
        <h2 className="font-semibold">New grant proposal</h2>
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="Agency" value={agency} onChange={(e) => setAgency(e.target.value)} />
        <Input
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button
          onClick={() =>
            api
              .post('/api/research/proposals', {
                title,
                agency,
                requested_amount: Number(amount),
                allowed_expense_categories: ['EQUIPMENT', 'CONSUMABLES', 'MANPOWER'],
              })
              .then((p: any) => api.post(`/api/research/proposals/${p.proposal_id}/submit`))
              .then(() => {
                toast.success('Submitted to Dean of Research');
                return reload();
              })
              .catch((e) => toast.error(String(e?.message ?? e)))
          }
        >
          Create & submit to DoR
        </Button>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Proposals</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="p-2">Title</th>
              <th className="p-2">Agency</th>
              <th className="p-2">Amount</th>
              <th className="p-2">Status</th>
              <th className="p-2">DoR</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((r) => (
              <tr key={String(r.proposal_id)} className="border-b">
                <td className="p-2">{String(r.title)}</td>
                <td className="p-2">{String(r.agency)}</td>
                <td className="p-2">₹{Number(r.requested_amount).toLocaleString('en-IN')}</td>
                <td className="p-2">{String(r.status)}</td>
                <td className="p-2">
                  {r.status === 'PENDING_DOR' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        api
                          .post(`/api/research/proposals/${r.proposal_id}/decide`, {
                            decision: 'APPROVED',
                          })
                          .then(() => {
                            toast.success('Grant activated');
                            return reload();
                          })
                          .catch((e) => toast.error(String(e?.message ?? e)))
                      }
                    >
                      Approve (DoR)
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Active grants ledger</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="p-2">Grant</th>
              <th className="p-2">Agency</th>
              <th className="p-2">Sanctioned</th>
              <th className="p-2">Available</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.grant_id)} className="border-b">
                <td className="p-2">{String(r.grant_title)}</td>
                <td className="p-2">{String(r.agency || r.funding_agency)}</td>
                <td className="p-2">₹{Number(r.sanctioned_amount).toLocaleString('en-IN')}</td>
                <td className="p-2">
                  ₹{Number(r.available_amount ?? r.balance ?? 0).toLocaleString('en-IN')}
                </td>
                <td className="p-2">{String(r.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
