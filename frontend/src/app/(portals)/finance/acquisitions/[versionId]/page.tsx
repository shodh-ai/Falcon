'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleDollarSign, GitCompare, ShieldCheck, Truck } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { createAcquisitionsApi, type AcquisitionDetail } from '@/lib/api/api.acquisitions';
import { toast } from '@/lib/notifications/falcon-toast';
import { AcquisitionStatus } from '@/components/acquisitions/AcquisitionStatus';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const money = (value: unknown, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value ?? 0));

export default function AcquisitionDetailPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = use(params);
  const authed = useAuthedApi();
  const api = useMemo(() => createAcquisitionsApi(authed), [authed]);
  const [detail, setDetail] = useState<AcquisitionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [selections, setSelections] = useState<Record<string, { vendor_id: string; deviation_justification: string }>>({});
  const load = useCallback(() => api.get(versionId).then(setDetail).catch((error) => toast.error(error.message)), [api, versionId]);
  useEffect(() => { void load(); }, [load]);
  if (!detail) return <div className="p-8 text-sm text-muted-foreground">Loading secure acquisition snapshot…</div>;

  const act = async (action: 'validate'|'submit'|'recommend'|'withdraw'|'amend') => {
    setBusy(true);
    try {
      const result = await api[action](versionId);
      if (action === 'amend' && result.acquisition_version_id) window.location.assign(`/finance/acquisitions/${result.acquisition_version_id}`);
      else { await load(); toast.success(`${action} completed`); }
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  const byLine = (lineId: string) => detail.recommendations.filter((item) => item.line_id === lineId);
  const submitVendors = async () => {
    const payload = detail.lines.filter((line) => line.line_status === 'ACTIVE').map((line) => ({ line_id: line.line_id, ...(selections[line.line_id] ?? { vendor_id:'', deviation_justification:'' }) }));
    if (payload.some((item) => !item.vendor_id)) return toast.error('Select one vendor for every active line');
    setBusy(true); try { await api.selectVendors(versionId,payload); await load(); toast.success('Vendors selected; budget was checked and the DoFA route opened'); }
    catch (error) { toast.error(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  };

  return <div className="space-y-6 p-6">
    <div><Link href="/finance/acquisitions" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4"/>Acquisition queue</Link><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-3"><h1 className="text-2xl font-black">{detail.acquisition_number}</h1><AcquisitionStatus status={detail.status}/></div><p className="mt-1 text-sm text-muted-foreground">Version {detail.version_number} · {detail.intended_use_case}</p></div><div className="flex flex-wrap gap-2">{detail.allowed_actions?.validate && <Button disabled={busy} onClick={() => void act('validate')}>Validate</Button>}{detail.allowed_actions?.submit && <Button disabled={busy} onClick={() => void act('submit')}>Submit to Procurement</Button>}{detail.allowed_actions?.vendor_review && <Button variant="outline" disabled={busy} onClick={() => void act('recommend')}>Recalculate recommendations</Button>}{detail.allowed_actions?.withdraw && <Button variant="destructive" disabled={busy} onClick={() => void act('withdraw')}>Withdraw</Button>}{detail.allowed_actions?.amend && <Button disabled={busy} onClick={() => void act('amend')}>Create amendment</Button>}</div></div></div>

    <div className="grid gap-3 md:grid-cols-4">{[
      ['Approved estimate',money(detail.estimated_total,detail.currency),CircleDollarSign],
      ['Required by',detail.required_by_date ? new Date(detail.required_by_date).toLocaleDateString('en-IN'):'—',Truck],
      ['Snapshot',detail.snapshot_hash ? `${detail.snapshot_hash.slice(0,12)}…`:'Created at validation',ShieldCheck],
      ['Source',detail.source,GitCompare],
    ].map(([label,value,Icon]) => <Card key={String(label)}><CardContent className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 text-blue-600"/><div><p className="text-xs uppercase text-muted-foreground">{String(label)}</p><p className="font-semibold">{String(value)}</p></div></CardContent></Card>)}</div>

    <Tabs defaultValue="lines">
      <TabsList><TabsTrigger value="lines">Product lines</TabsTrigger><TabsTrigger value="vendors">Vendor review</TabsTrigger><TabsTrigger value="budget">Budget</TabsTrigger><TabsTrigger value="dofa">DoFA & audit</TabsTrigger></TabsList>
      <TabsContent value="lines" className="space-y-3">{detail.lines.map((line) => <Card key={line.line_id}><CardHeader className="pb-2"><div className="flex justify-between"><CardTitle className="text-base">{line.line_number}. {line.product_name}</CardTitle><span className="text-sm font-semibold">{money(line.estimated_line_total,detail.currency)}</span></div></CardHeader><CardContent className="grid gap-2 text-sm md:grid-cols-3"><p><span className="text-muted-foreground">Category:</span> {line.category}</p><p><span className="text-muted-foreground">Quantity:</span> {line.quantity} {line.unit}</p><p><span className="text-muted-foreground">Layout:</span> {line.acquisition_layout}</p><p className="md:col-span-3"><span className="text-muted-foreground">Specifications:</span> {typeof line.technical_specifications === 'object' ? JSON.stringify(line.technical_specifications) : String(line.technical_specifications ?? '')}</p>{(line.validation_errors ?? []).length > 0 && <p className="md:col-span-3 text-red-700">{(line.validation_errors ?? []).join(' · ')}</p>}</CardContent></Card>)}</TabsContent>
      <TabsContent value="vendors" className="space-y-4">{detail.lines.map((line) => <Card key={line.line_id}><CardHeader><CardTitle className="text-base">{line.product_name}</CardTitle></CardHeader><CardContent className="space-y-3">{byLine(line.line_id).map((candidate) => <label key={candidate.recommendation_id} className="grid cursor-pointer gap-2 rounded-lg border p-3 md:grid-cols-[auto_1fr_auto]"><input type="radio" name={line.line_id} checked={selections[line.line_id]?.vendor_id === candidate.vendor_id} onChange={() => setSelections({...selections,[line.line_id]:{vendor_id:candidate.vendor_id,deviation_justification:''}})}/><div><strong>#{candidate.rank} {candidate.vendor_name}</strong><p className="text-xs text-muted-foreground">{candidate.explanation}</p><p className="mt-1 text-xs">Confidence: {candidate.confidence} · policy v{candidate.scoring_policy_version}</p></div><strong>{Number(candidate.final_score).toFixed(2)}</strong></label>)}{!byLine(line.line_id).length && <p className="text-sm text-muted-foreground">Run the deterministic scoring policy to produce eligible candidates.</p>}{selections[line.line_id] && byLine(line.line_id)[0]?.vendor_id !== selections[line.line_id].vendor_id && <Input placeholder="Required deviation justification (minimum 20 characters)" value={selections[line.line_id].deviation_justification} onChange={(e) => setSelections({...selections,[line.line_id]:{...selections[line.line_id],deviation_justification:e.target.value}})}/>}</CardContent></Card>)}{detail.allowed_actions?.vendor_review && <Button disabled={busy} onClick={() => void submitVendors()}>Confirm vendors and reserve budget</Button>}</TabsContent>
      <TabsContent value="budget"><Card><CardHeader><CardTitle>Immutable reservation</CardTitle></CardHeader><CardContent>{detail.budget_reservation ? <div className="grid gap-3 text-sm md:grid-cols-3"><p><span className="text-muted-foreground">Reservation:</span><br/>{detail.budget_reservation.budget_reservation_id}</p><p><span className="text-muted-foreground">Amount:</span><br/>{money(detail.budget_reservation.amount,detail.budget_reservation.currency)}</p><p><span className="text-muted-foreground">Status:</span><br/>{detail.budget_reservation.status}</p><p><span className="text-muted-foreground">Expires:</span><br/>{new Date(detail.budget_reservation.expires_at).toLocaleString('en-IN')}</p></div>:<p className="text-sm text-muted-foreground">No reservation yet. Procurement selection triggers a transactional availability check.</p>}</CardContent></Card></TabsContent>
      <TabsContent value="dofa" className="space-y-4"><Card><CardHeader><CardTitle>Resolved approval route</CardTitle></CardHeader><CardContent>{detail.dofa_route ? <><p className="mb-3 break-all text-xs text-muted-foreground">Route hash: {detail.dofa_route.route_snapshot_hash}</p><div className="space-y-2">{(detail.dofa_route.approval_route ?? []).map((step) => <div key={`${step.level}-${step.required_role}`} className="flex items-center gap-3 rounded border p-3"><CheckCircle2 className="h-4 w-4 text-blue-600"/><span>Level {step.level}: {step.required_role}</span></div>)}</div><Link href="/finance/approvals/dofa-inbox"><Button className="mt-4" variant="outline">Open universal DoFA inbox</Button></Link></>:<p className="text-sm text-muted-foreground">The route is pinned only after a successful budget reservation.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Append-only decision and audit timeline</CardTitle></CardHeader><CardContent className="space-y-3">{[...detail.approval_decisions.map((item) => ({...item,label:`${item.decision} · ${item.approver_role}`,at:item.decision_at,hash:item.decision_hash})),...detail.audit_timeline.map((item) => ({...item,label:item.event_type,at:item.created_at,hash:item.event_hash}))].sort((a,b) => new Date(a.at).getTime()-new Date(b.at).getTime()).map((item,index) => <div key={`${item.hash}-${index}`} className="border-l-2 border-slate-200 pl-4"><p className="font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{new Date(item.at).toLocaleString('en-IN')} · {String(item.hash ?? '').slice(0,16)}…</p></div>)}</CardContent></Card></TabsContent>
    </Tabs>
  </div>;
}
