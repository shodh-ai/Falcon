import { MyHelpdeskPanel } from '@/components/self-service/MyHelpdeskPanel';
import { Card, CardContent } from '@/components/ui/card';

export default function HrSelfTicketsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card>
        <CardContent className="p-6">
          <section>
            <h2 className="text-2xl font-bold text-sgvu-navy">My Helpdesk Tickets</h2>
            <p className="mt-1 text-sm text-muted-foreground">Raise and track IT, HR, and facilities requests.</p>
          </section>
        </CardContent>
      </Card>
      <MyHelpdeskPanel />
    </div>
  );
}
