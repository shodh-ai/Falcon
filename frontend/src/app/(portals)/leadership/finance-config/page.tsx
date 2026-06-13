'use client';

import { useEffect, useMemo, useState } from 'react';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { useLeadershipApi, type BankBalanceSnapshot, type FinanceAllocationRule } from '@/lib/api/api.leadership';

export default function LeadershipFinanceConfigPage() {
  const api = useLeadershipApi();

  const [feeHead, setFeeHead] = useState('TUITION');
  const [rules, setRules] = useState<FinanceAllocationRule[]>([]);
  const [ruleLedgerCategory, setRuleLedgerCategory] = useState('TUITION_GENERAL');
  const [ruleWeight, setRuleWeight] = useState('1');

  const [bankAccountKey, setBankAccountKey] = useState('PRIMARY');
  const [balanceDate, setBalanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [closingBalance, setClosingBalance] = useState('0');
  const [snapshots, setSnapshots] = useState<BankBalanceSnapshot[]>([]);

  const totalWeight = useMemo(
    () => rules.filter((r) => r.is_active).reduce((s, r) => s + Number(r.weight ?? 0), 0),
    [rules],
  );

  const refreshRules = () =>
    api
      .listAllocationRules({ fee_head: feeHead })
      .then((r) => setRules(r))
      .catch(() => setRules([]));

  const refreshSnapshots = () =>
    api
      .listBankBalanceSnapshots({ bank_account_key: bankAccountKey })
      .then((r) => setSnapshots(r))
      .catch(() => setSnapshots([]));

  useEffect(() => {
    void refreshRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeHead]);

  useEffect(() => {
    void refreshSnapshots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankAccountKey]);

  return (
    <div className="space-y-6 p-6">
      <LeadershipPageHeader
        eyebrow="Finance Config"
        title="Allocation Rules + Bank Snapshot"
        description="Configure Money-IN splits and the daily authoritative balance used by the Cash Waterfall"
      />

      <LeadershipSectionCard title="Allocation rules (inflow splits)">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">
            Fee head
            <input
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
              value={feeHead}
              onChange={(e) => setFeeHead(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Ledger category
            <input
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
              value={ruleLedgerCategory}
              onChange={(e) => setRuleLedgerCategory(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Weight
            <input
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
              value={ruleWeight}
              onChange={(e) => setRuleWeight(e.target.value)}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className="w-full rounded-md bg-sgvu-navy px-3 py-2 text-sm font-semibold text-white"
              onClick={() => {
                void api
                  .upsertAllocationRule({ fee_head: feeHead, ledger_category: ruleLedgerCategory, weight: Number(ruleWeight) })
                  .then(() => refreshRules());
              }}
            >
              Add rule
            </button>
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-600">Active total weight: {totalWeight.toFixed(4)}</div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="border-b p-2">Ledger category</th>
                <th className="border-b p-2">Weight</th>
                <th className="border-b p-2">Active</th>
                <th className="border-b p-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.rule_id}>
                  <td className="border-b p-2 font-mono text-xs">{r.ledger_category}</td>
                  <td className="border-b p-2">{Number(r.weight).toFixed(4)}</td>
                  <td className="border-b p-2">{r.is_active ? 'YES' : 'NO'}</td>
                  <td className="border-b p-2 text-right">
                    <button
                      type="button"
                      className="rounded-md border bg-white px-2 py-1 text-xs font-semibold"
                      onClick={() => {
                        void api
                          .upsertAllocationRule({
                            rule_id: r.rule_id,
                            fee_head: r.fee_head,
                            program_code: r.program_code,
                            template_id: r.template_id,
                            ledger_category: r.ledger_category,
                            weight: Number(r.weight),
                            is_active: !r.is_active,
                          })
                          .then(() => refreshRules());
                      }}
                    >
                      Toggle
                    </button>
                  </td>
                </tr>
              ))}
              {!rules.length ? (
                <tr>
                  <td className="p-2 text-sm text-slate-500" colSpan={4}>
                    No rules found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </LeadershipSectionCard>

      <LeadershipSectionCard title="Bank balance snapshots (authoritative)">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">
            Bank account key
            <input
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
              value={bankAccountKey}
              onChange={(e) => setBankAccountKey(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Balance date
            <input
              type="date"
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
              value={balanceDate}
              onChange={(e) => setBalanceDate(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Closing balance
            <input
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className="w-full rounded-md bg-sgvu-navy px-3 py-2 text-sm font-semibold text-white"
              onClick={() => {
                void api
                  .upsertBankBalanceSnapshot({
                    bank_account_key: bankAccountKey,
                    balance_date: balanceDate,
                    closing_balance: Number(closingBalance),
                    source: 'MANUAL',
                    payload: {},
                  })
                  .then(() => refreshSnapshots());
              }}
            >
              Upsert snapshot
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="border-b p-2">Date</th>
                <th className="border-b p-2">Closing balance</th>
                <th className="border-b p-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.snapshot_id}>
                  <td className="border-b p-2 font-mono text-xs">{s.balance_date}</td>
                  <td className="border-b p-2">₹{Number(s.closing_balance).toLocaleString('en-IN')}</td>
                  <td className="border-b p-2">{s.source}</td>
                </tr>
              ))}
              {!snapshots.length ? (
                <tr>
                  <td className="p-2 text-sm text-slate-500" colSpan={3}>
                    No snapshots found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </LeadershipSectionCard>
    </div>
  );
}
