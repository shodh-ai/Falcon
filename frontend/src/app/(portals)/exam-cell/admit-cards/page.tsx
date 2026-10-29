'use client';

import { useState } from 'react';
import { Ticket, ClipboardCheck, ListChecks } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import HallTicketReadiness from '@/components/exam-cell/HallTicketReadiness';
import HallTicketApprovals from '@/components/exam-cell/HallTicketApprovals';

export default function HallTicketsPage() {
  const { user } = useAuth();
  const scope = [user?.user_id, user?.tenant_id, user?.primaryRole ?? user?.role].join(':');
  return <HallTicketWorkspace key={scope} />;
}

function HallTicketWorkspace() {
  const [tab, setTab] = useState('readiness');
  const [sessionId, setSessionId] = useState('');
  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 p-4 md:p-6">
      <header className="overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-white shadow-sm">
        <div className="flex items-center gap-4 p-5 sm:px-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy"><Ticket className="h-6 w-6 text-sgvu-gold" aria-hidden="true" /></div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Examination operations</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Hall Tickets</h1>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">Review student requirements and approvals for your exam session.</p>
          </div>
        </div>
        <ol className="grid grid-cols-1 gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 min-[380px]:grid-cols-2 sm:px-6 lg:grid-cols-4" aria-label="Hall ticket process">
          {['Select session', 'Check requirements', 'Review approvals', 'Issue ticket'].map((step, index) => (
            <li key={step} className="flex min-w-0 items-center gap-2.5 text-xs text-sgvu-navy">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-sgvu-navy/15 bg-white text-[11px] font-semibold" aria-hidden="true">{index + 1}</span>
              <span className="font-medium leading-5">{step}</span>
            </li>
          ))}
        </ol>
      </header>
      <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-5">
        <TabsList className="grid h-auto w-full shrink-0 grid-cols-1 gap-2 group-data-[orientation=horizontal]/tabs:h-auto sm:grid-cols-2 rounded-xl bg-slate-100 p-1.5">
          <TabsTrigger value="readiness" className="h-auto min-h-16 min-w-0 justify-start gap-3 whitespace-normal rounded-lg px-3 py-3 text-left data-[state=active]:bg-white data-[state=active]:text-sgvu-navy data-[state=active]:shadow-sm sm:px-5">
            <ClipboardCheck className="hidden h-5 w-5 shrink-0 sm:block" aria-hidden="true" />
            <span><span className="block font-semibold">Readiness &amp; issuance</span><span className="mt-0.5 hidden text-xs font-normal text-muted-foreground sm:block">Session, students and clearance checks</span></span>
          </TabsTrigger>
          <TabsTrigger value="approvals" className="h-auto min-h-16 min-w-0 justify-start gap-3 whitespace-normal rounded-lg px-3 py-3 text-left data-[state=active]:bg-white data-[state=active]:text-sgvu-navy data-[state=active]:shadow-sm sm:px-5" aria-label="Approval queue">
            <ListChecks className="hidden h-5 w-5 shrink-0 sm:block" aria-hidden="true" />
            <span><span className="block font-semibold">Approval queue</span><span className="mt-0.5 hidden text-xs font-normal text-muted-foreground sm:block">Review each required approval stage</span></span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="readiness" className="min-w-0">
          <HallTicketReadiness sessionId={sessionId} onSessionChange={setSessionId} onOpenApprovals={() => setTab('approvals')} />
        </TabsContent>
        <TabsContent value="approvals" className="min-w-0">
          <HallTicketApprovals sessionId={sessionId} onSessionChange={setSessionId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
