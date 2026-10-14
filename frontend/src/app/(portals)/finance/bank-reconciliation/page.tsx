'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

const BASE = '/api/finance/accounting/v1';
type Bank = { bank_account_id: string; display_name: string; masked_account_number: string; account_code: string };
type Statement = { statement_id: string; period_start: string; period_end: string; status: string; revision: string; closing_balance: string };
type StatementLine = { statement_line_id: string; row_number: number; transaction_date: string; description: string; bank_reference: string | null; debit: string; credit: string; match_id: string | null; match_status: string | null; match_revision: string | null };
type Candidate = { journal_line_id: string; entry_date: string; narration: string; source_type: string; source_id: string; debit: string; credit: string; match_id: string | null; outstanding_id: string | null; outstanding_status: string | null; outstanding_revision: string | null };
type Preview = { bank_closing_balance: string; ledger_closing_balance: string; outstanding_deposits: string; outstanding_payments: string; adjusted_bank_balance: string; difference: string; unmatched_statement_lines: number; unresolved_ledger_lines: number; ledger_revision: string };

function formatAmount(value: string | undefined) {
  return Number(value ?? '0').toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function template() {
  const csv = 'transaction_date,value_date,description,bank_reference,debit,credit,running_balance\n2026-10-13,2026-10-13,Example receipt,REF-001,0.00,100.00,100.00\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'falcon-bank-statement-template.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function BankReconciliationPage() {
  const api = useAuthedApi();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankId, setBankId] = useState('');
  const [statements, setStatements] = useState<Statement[]>([]);
  const [statementId, setStatementId] = useState('');
  const [detail, setDetail] = useState<{statement: Statement; lines: StatementLine[]} | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadKey, setUploadKey] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [maskedNumber, setMaskedNumber] = useState('');
  const [selectedMatch, setSelectedMatch] = useState<Record<string,string>>({});
  const [reason, setReason] = useState('Reference, amount and date checked');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadBanks = useCallback(async () => {
    const result = await api.get<Bank[]>(`${BASE}/banks`);
    setBanks(result);
    setBankId((current) => current || result[0]?.bank_account_id || '');
  }, [api]);
  useEffect(() => {
    void api.get<Bank[]>(`${BASE}/banks`)
      .then((result) => {
        setBanks(result);
        setBankId((current) => current || result[0]?.bank_account_id || '');
      })
      .catch((cause: Error) => setError(cause.message));
  }, [api]);
  useEffect(() => {
    if (!bankId) return;
    let cancelled = false;
    void api.get<Statement[]>(`${BASE}/banks/${bankId}/statements`)
      .then((result) => {
        if (cancelled) return;
        setStatements(result);
        setStatementId((current) => current || result[0]?.statement_id || '');
      })
      .catch((cause: Error) => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [api, bankId]);
  const loadStatement = useCallback(async (id: string) => {
    const [nextDetail, nextCandidates, nextPreview] = await Promise.all([
      api.get<{statement:Statement;lines:StatementLine[]}>(`${BASE}/bank-statements/${id}`),
      api.get<Candidate[]>(`${BASE}/bank-statements/${id}/candidates`),
      api.get<Preview>(`${BASE}/bank-statements/${id}/reconciliation`),
    ]);
    setDetail(nextDetail); setCandidates(nextCandidates); setPreview(nextPreview);
  }, [api]);
  useEffect(() => {
    if (!statementId) return;
    let cancelled = false;
    void Promise.all([
      api.get<{statement:Statement;lines:StatementLine[]}>(`${BASE}/bank-statements/${statementId}`),
      api.get<Candidate[]>(`${BASE}/bank-statements/${statementId}/candidates`),
      api.get<Preview>(`${BASE}/bank-statements/${statementId}/reconciliation`),
    ]).then(([nextDetail, nextCandidates, nextPreview]) => {
      if (cancelled) return;
      setDetail(nextDetail); setCandidates(nextCandidates); setPreview(nextPreview);
    }).catch((cause: Error) => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [api, statementId]);

  const unmatched = useMemo(() => candidates.filter((item) => !item.match_id && !item.outstanding_id), [candidates]);
  async function act(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <FinancePageHeader title="Bank Reconciliation" description="Match bank evidence to the canonical GL. Statement imports never post journal entries or alter bank balances." />
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Provisional workbench. Only an independent reviewer can approve matches or the final reconciliation. Unmatched bank items require a separately authorized journal correction; they cannot be written off here.</p>
      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900">{notice}</p>}

      <Card><CardHeader><CardTitle>Bank ledger account</CardTitle></CardHeader><CardContent className="space-y-3">
        <select aria-label="Bank account" className="w-full rounded-md border p-2 md:w-96" value={bankId} onChange={(event) => {
          setBankId(event.target.value); setStatementId(''); setStatements([]);
          setDetail(null); setCandidates([]); setPreview(null);
        }}>
          <option value="">Select a bank account</option>
          {banks.map((bank) => <option key={bank.bank_account_id} value={bank.bank_account_id}>{bank.display_name} · {bank.masked_account_number} · GL {bank.account_code}</option>)}
        </select>
        <details><summary className="cursor-pointer text-sm underline">Register a bank ledger mapping (Controller)</summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input placeholder="Approved asset GL code" aria-label="Approved asset GL code" value={accountCode} onChange={(event) => setAccountCode(event.target.value)} className="w-48" />
            <Input placeholder="Bank display name" aria-label="Bank display name" value={bankName} onChange={(event) => setBankName(event.target.value)} className="w-48" />
            <Input placeholder="****1234" aria-label="Masked account number" value={maskedNumber} onChange={(event) => setMaskedNumber(event.target.value)} className="w-40" />
            <Button disabled={busy} onClick={() => void act(async () => {
              await api.post(`${BASE}/banks`, {account_code:accountCode,display_name:bankName,masked_account_number:maskedNumber}, {'Idempotency-Key': crypto.randomUUID()});
              await loadBanks(); setNotice('Bank ledger mapping registered.');
            })}>Register</Button>
          </div>
        </details>
      </CardContent></Card>

      {bankId && <Card><CardHeader><CardTitle>Import statement evidence</CardTitle></CardHeader><CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Upload the normalized CSV with transaction date, value date, description, reference, debit, credit and optional running balance. Debit means money out of the bank; credit means money in. The original file is retained and scanned before import.</p>
        <Button type="button" variant="outline" onClick={template}>Download CSV template</Button>
        <Input type="file" accept=".csv,text/csv" aria-label="Bank statement CSV" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setUploadKey(crypto.randomUUID()); }} />
        <div className="flex flex-wrap gap-2">
          <label className="text-sm">From <Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
          <label className="text-sm">To <Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
          <label className="text-sm">Opening balance <Input inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} /></label>
          <label className="text-sm">Closing balance <Input inputMode="decimal" value={closingBalance} onChange={(event) => setClosingBalance(event.target.value)} /></label>
        </div>
        <Button disabled={busy || !file || !periodStart || !periodEnd || !openingBalance || !closingBalance} onClick={() => void act(async () => {
          if (!file) return;
          const data = new FormData(); data.append('file', file);
          const uploaded = await api.post<{upload_id:string}>(`${BASE}/banks/${bankId}/statement-uploads`, data, {'Idempotency-Key':uploadKey});
          const result = await api.post<{statement_id:string}>(`${BASE}/banks/${bankId}/statements`, {
            source_upload_id:uploaded.upload_id,period_start:periodStart,period_end:periodEnd,
            opening_balance:openingBalance,closing_balance:closingBalance,
          }, {'Idempotency-Key':`statement:${uploaded.upload_id}`});
          const list = await api.get<Statement[]>(`${BASE}/banks/${bankId}/statements`);
          setStatements(list); setStatementId(result.statement_id); setNotice('Statement imported for independent matching and review.');
        })}>Upload and import</Button>
      </CardContent></Card>}

      {bankId && <Card><CardHeader><CardTitle>Statements</CardTitle></CardHeader><CardContent>
        <select aria-label="Statement" className="w-full rounded-md border p-2 md:w-96" value={statementId} onChange={(event) => {
          setStatementId(event.target.value); setDetail(null); setCandidates([]); setPreview(null);
        }}>
          <option value="">Select a statement</option>
          {statements.map((item) => <option key={item.statement_id} value={item.statement_id}>{String(item.period_start).slice(0,10)} to {String(item.period_end).slice(0,10)} · {item.status}</option>)}
        </select>
      </CardContent></Card>}

      {detail && preview && detail.statement.statement_id === statementId && <>
        <Button variant="outline" disabled={busy} onClick={() => void act(async () => {
          const blob = await api.getBlob(`${BASE}/bank-statements/${statementId}/source`);
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a'); anchor.href = url;
          anchor.download = `bank-statement-${statementId}.csv`; anchor.click();
          URL.revokeObjectURL(url);
        })}>Download source statement</Button>
        <Card><CardHeader><CardTitle>Reconciliation preview · ledger revision {preview.ledger_revision}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
          <p>Bank closing ₹{formatAmount(preview.bank_closing_balance)} + deposits in transit ₹{formatAmount(preview.outstanding_deposits)} − outstanding payments ₹{formatAmount(preview.outstanding_payments)} = adjusted bank ₹{formatAmount(preview.adjusted_bank_balance)}</p>
          <p>GL closing ₹{formatAmount(preview.ledger_closing_balance)} · Difference ₹{formatAmount(preview.difference)}</p>
          <p>Unmatched statement lines: {preview.unmatched_statement_lines} · Unresolved GL lines: {preview.unresolved_ledger_lines}</p>
          <Button disabled={busy || detail.statement.status !== 'REVIEW_PENDING' || preview.difference !== '0.00' || preview.unmatched_statement_lines !== 0 || preview.unresolved_ledger_lines !== 0} onClick={() => void act(async () => {
            await api.post(`${BASE}/bank-statements/${statementId}/reconcile`, {}, {'Idempotency-Key':`reconcile:${statementId}`, 'If-Match':String(detail.statement.revision)});
            await loadStatement(statementId); setNotice('Reconciliation approved and pinned to the GL revision.');
          })}>Approve final reconciliation</Button>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Statement lines and matches</CardTitle></CardHeader><CardContent className="space-y-3">
          {detail.lines.map((line) => {
            const options = candidates.filter((candidate) => !candidate.match_id && !candidate.outstanding_id &&
              Number(candidate.debit) === Number(line.credit) && Number(candidate.credit) === Number(line.debit));
            return <div key={line.statement_line_id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">#{line.row_number} · {String(line.transaction_date).slice(0,10)} · {line.description}</p>
              <p>Bank debit ₹{formatAmount(line.debit)} · credit ₹{formatAmount(line.credit)} · {line.match_status ?? 'UNMATCHED'}</p>
              {line.match_status === 'PROPOSED' && line.match_id && <div className="mt-2 flex gap-2">
                <Button disabled={busy} onClick={() => void act(async () => {
                  await api.post(`${BASE}/bank-matches/${line.match_id}/review`,{approve:true},{'Idempotency-Key':`approve:${line.match_id}`,'If-Match':String(line.match_revision)});
                  await loadStatement(statementId); setNotice('Match approved.');
                })}>Approve match</Button>
                <Button disabled={busy} variant="outline" onClick={() => void act(async () => {
                  await api.post(`${BASE}/bank-matches/${line.match_id}/review`,{approve:false},{'Idempotency-Key':`reject:${line.match_id}`,'If-Match':String(line.match_revision)});
                  await loadStatement(statementId); setNotice('Match rejected.');
                })}>Reject</Button>
              </div>}
              {!line.match_id && detail.statement.status === 'REVIEW_PENDING' && <div className="mt-2 flex flex-wrap items-center gap-2">
                <select aria-label={`Ledger match for row ${line.row_number}`} className="min-w-64 rounded-md border p-2" value={selectedMatch[line.statement_line_id] ?? ''} onChange={(event) => setSelectedMatch((current) => ({...current,[line.statement_line_id]:event.target.value}))}>
                  <option value="">Select exact GL line</option>
                  {options.map((candidate) => <option key={candidate.journal_line_id} value={candidate.journal_line_id}>{String(candidate.entry_date).slice(0,10)} · {candidate.source_type} · {candidate.narration}</option>)}
                </select>
                <Button disabled={busy || !selectedMatch[line.statement_line_id]} onClick={() => void act(async () => {
                  await api.post(`${BASE}/bank-statements/${statementId}/matches`,{statement_line_id:line.statement_line_id,journal_line_id:selectedMatch[line.statement_line_id],reason},{'Idempotency-Key':`match:${line.statement_line_id}:${selectedMatch[line.statement_line_id]}`,'If-Match':String(detail.statement.revision)});
                  await loadStatement(statementId); setNotice('Match proposed for independent review.');
                })}>Propose match</Button>
              </div>}
            </div>;
          })}
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Unmatched GL bank lines</CardTitle></CardHeader><CardContent className="space-y-3">
          <label className="text-sm">Reason for an outstanding item <Input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1" /></label>
          {candidates.filter((item) => !item.match_id).map((item) => <div key={item.journal_line_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <div><p className="font-medium">{String(item.entry_date).slice(0,10)} · {item.narration}</p><p>Debit ₹{formatAmount(item.debit)} · credit ₹{formatAmount(item.credit)} · {item.outstanding_status ?? 'UNRESOLVED'}</p></div>
            {!item.outstanding_id && detail.statement.status === 'REVIEW_PENDING' && <Button disabled={busy} variant="outline" onClick={() => void act(async () => {
              await api.post(`${BASE}/bank-statements/${statementId}/outstanding`,{journal_line_id:item.journal_line_id,kind:Number(item.debit)>0?'DEPOSIT_IN_TRANSIT':'OUTSTANDING_PAYMENT',reason},{'Idempotency-Key':`outstanding:${statementId}:${item.journal_line_id}`,'If-Match':String(detail.statement.revision)});
              await loadStatement(statementId); setNotice('Outstanding item proposed for independent review.');
            })}>Mark outstanding</Button>}
            {item.outstanding_status === 'PROPOSED' && item.outstanding_id && <Button disabled={busy} onClick={() => void act(async () => {
              await api.post(`${BASE}/bank-outstanding/${item.outstanding_id}/review`,{approve:true},{'Idempotency-Key':`approve:${item.outstanding_id}`,'If-Match':String(item.outstanding_revision)});
              await loadStatement(statementId); setNotice('Outstanding item approved.');
            })}>Approve outstanding</Button>}
          </div>)}
          {!unmatched.length && <p className="text-sm text-muted-foreground">No unresolved GL candidates for this statement period.</p>}
        </CardContent></Card>
      </>}
    </div>
  );
}
