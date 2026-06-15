import { MyHelpdeskPanel } from '@/components/self-service/MyHelpdeskPanel';

export default function HodTicketsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">My Helpdesk Tickets</h2>
        <p className="text-sm text-muted-foreground">Raise and track IT, HR, and facilities requests.</p>
      </section>
      <MyHelpdeskPanel />
    </div>
  );
}
