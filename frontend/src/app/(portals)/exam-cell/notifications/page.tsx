'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';

const btnIdle =
  'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';
const btnBusy = 'h-10 border border-sgvu-gold bg-sgvu-gold px-5 text-sm font-semibold text-sgvu-navy';

type Campaign = {
  campaign_id: string;
  channel: string;
  subject: string;
  body: string;
  recipient_count: number;
  sent_by_name: string | null;
  sent_at: string;
};

type SendResult = {
  delivered?: number;
  channel?: string;
  message?: string;
};

const CHANNEL_HELP: Record<string, string> = {
  IN_APP: 'Creates notifications on each student\'s Falcon account (Student Portal → Notifications).',
  EMAIL: 'Queues email to student official email + in-app notification.',
  SMS: 'Queues SMS to student mobile (if on file) + in-app notification.',
  WHATSAPP: 'Queues WhatsApp message + in-app notification. Requires MSG91/WhatsApp integration in production.',
};

export default function ExamCellNotificationsPage() {
  const api = useAuthedApi();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ channel: 'IN_APP', subject: '', body: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCampaigns(await api.get<Campaign[]>('/api/exam-cell/notifications/campaigns'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function send() {
    if (!form.subject.trim() || !form.body.trim()) {
      toast.error('Subject and message are required');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<SendResult>('/api/exam-cell/notifications/send', form);
      const detail = res.message ?? `Delivered to ${res.delivered ?? 0} students via ${res.channel ?? form.channel}`;
      toast.success(detail);
      setForm((f) => ({ ...f, subject: '', body: '' }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  }

  const columns: DataTableColumn<Campaign>[] = [
    { key: 'subject', header: 'Subject', render: (r) => r.subject },
    { key: 'channel', header: 'Channel', render: (r) => <Badge variant="outline">{r.channel}</Badge> },
    { key: 'recipients', header: 'Recipients', render: (r) => r.recipient_count },
    { key: 'sent_by', header: 'Sent by', render: (r) => r.sent_by_name ?? '—' },
    { key: 'when', header: 'Sent at', render: (r) => new Date(r.sent_at).toLocaleString('en-IN') },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="notifications" />
        </CardContent>
      </Card>
      <Card className="border-sgvu-gold/20 bg-amber-50/40">
        <CardContent className="flex gap-3 py-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" />
          <p>
            Campaigns are delivered to <strong>all active students</strong> in your tenant. In-app alerts appear on the
            Student Portal. Email/SMS/WhatsApp require the notification worker and provider credentials (BullMQ queue).
            Log in as a student to verify in-app delivery.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Send examination alert</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select className="w-full rounded-md border px-3 py-2 text-sm" value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
            <option value="IN_APP">In-app notification</option>
            <option value="EMAIL">Email</option>
            <option value="SMS">SMS</option>
            <option value="WHATSAPP">WhatsApp</option>
          </Select>
          <p className="text-xs text-muted-foreground">{CHANNEL_HELP[form.channel]}</p>
          <Input placeholder="Subject (e.g. Hall tickets released)" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
          <textarea
            className="min-h-[100px] w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Message body…"
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          />
          <div className="flex justify-center border-t border-sgvu-navy/10 pt-4">
            <Button
              variant="outline"
              className={busy ? btnBusy : btnIdle}
              onClick={() => void send()}
              disabled={busy}
            >
              {busy ? 'Sending…' : 'Send to all students'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Campaign history</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
            <DataTable columns={columns} rows={campaigns} rowKey={(r) => r.campaign_id} emptyMessage="No notification campaigns sent yet." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
