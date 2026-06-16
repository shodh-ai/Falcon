'use client';

import { useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Users, Wallet, ClipboardList, Check, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProfileCorrectionWidget } from '@/components/hod/ProfileCorrectionWidget';

const approvals = [
  { id: '1', type: 'Leave', who: 'Dr. Mehta', detail: 'CL · 2 days', status: 'pending' },
  { id: '2', type: 'Fee waiver', who: 'Student #042', detail: 'Installment request', status: 'pending' },
  { id: '3', type: 'Leave', who: 'Prof. Singh', detail: 'SL · 1 day', status: 'pending' },
];

export default function AdminDashboardPage() {
  const [queue, setQueue] = useState(approvals);

  const act = (id: string, action: 'approve' | 'reject') => {
    setQueue((q) => q.filter((item) => item.id !== id));
    toast.success(action === 'approve' ? 'Approved' : 'Rejected');
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">University Health</h2>
        <p className="text-sm text-muted-foreground">Bird&apos;s-eye view for management</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active students</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl">
              <Users className="h-6 w-6 text-sgvu-gold" />
              4,280
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Staff attendance today</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">94%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fees collected (May)</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl">
              <Wallet className="h-6 w-6 text-sgvu-gold" />
              ₹1.2Cr
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-sgvu-gold" />
            Approvals queue
          </CardTitle>
          <CardDescription>Inline approve / reject — desktop table, mobile cards</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {queue.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Queue clear.</p>
          ) : (
            queue.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <Badge variant="outline" className="mb-2">
                    {item.type}
                  </Badge>
                  <p className="font-semibold text-sgvu-navy">{item.who}</p>
                  <p className="text-sm text-muted-foreground">{item.detail}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" className="flex-1 touch-target" onClick={() => act(item.id, 'approve')}>
                    <Check className="mr-1 h-4 w-4" />
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 touch-target" onClick={() => act(item.id, 'reject')}>
                    <X className="mr-1 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ProfileCorrectionWidget limit={10} />
    </div>
  );
}
