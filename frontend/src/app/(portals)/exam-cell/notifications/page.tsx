'use client';

import { useEffect, useRef, useState } from 'react';
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
type CampaignResult = { api: ReturnType<typeof useAuthedApi>; revision: number; data: Campaign[]; error: string | null };

type SendResult = {
  delivered?: number;
  channel?: string;
  message?: string;
};

const EXTERNAL_CHANNEL_REASON = 'Email, SMS and WhatsApp delivery is unavailable because provider delivery has not been implemented. Adding credentials alone does not enable these channels.';

export default function ExamCellNotificationsPage() {
  const api = useAuthedApi();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [busy, setBusy] = useState(false);
  const sendPending = useRef(false);
  const currentResult = result?.api === api && result.revision === revision ? result : null;
  const loading = !currentResult;
  const campaigns = currentResult?.data ?? [];
  const error = currentResult?.error;
  const [form, setForm] = useState({ channel: 'IN_APP', subject: '', body: '' });

  useEffect(() => {
    let current = true;
    void api.get<Campaign[]>('/api/exam-cell/notifications/campaigns')
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('The server did not return campaign history');
        if (current) setResult({ api, revision, data, error: null });
      })
      .catch((e: unknown) => {
        if (current) setResult({ api, revision, data: [], error: e instanceof Error ? e.message : 'Failed to load campaigns' });
      });
    return () => { current = false; };
  }, [api, revision]);

  async function send() {
    if (sendPending.current) return;
    if (form.channel !== 'IN_APP') { toast.error(EXTERNAL_CHANNEL_REASON); return; }
    if (!form.subject.trim() || !form.body.trim()) {
      toast.error('Subject and message are required');
      return;
    }
    sendPending.current = true;
    setBusy(true);
    try {
      const res = await api.post<SendResult>('/api/exam-cell/notifications/send', form);
      if (res.channel !== 'IN_APP' || !Number.isInteger(res.delivered) || Number(res.delivered) < 0)
        throw new Error('The server did not confirm in-app notification delivery');
      const detail = res.message ?? `${res.delivered} in-app notifications created on student accounts.`;
      if (res.delivered === 0) toast.error(detail);
      else toast.success(detail);
      if (Number(res.delivered) > 0) setForm((f) => ({ ...f, subject: '', body: '' }));
      setRevision((current) => current + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
    } finally {
      sendPending.current = false;
      setBusy(false);
    }
  }

  const columns: DataTableColumn<Campaign>[] = [
    { key: 'subject', header: 'Subject', render: (r) => r.subject },
    { key: 'channel', header: 'Channel', render: (r) => <div><Badge variant="outline">{r.channel}</Badge>{r.channel !== 'IN_APP' && <p className="mt-1 text-xs text-muted-foreground">External delivery unverified</p>}</div> },
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
            Student Portal. {EXTERNAL_CHANNEL_REASON} Log in as a student to verify in-app delivery.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Send examination alert</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select aria-label="Notification channel" disabled={busy} className="w-full rounded-md border px-3 py-2 text-sm" value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
            <option value="IN_APP">In-app notification</option>
          </Select>
          <p className="text-xs text-muted-foreground">Creates a notification on each active student’s Falcon account (Student Portal → Notifications).</p>
          <Input aria-label="Notification subject" maxLength={200} disabled={busy} placeholder="Subject (e.g. Hall tickets released)" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
          <textarea
            aria-label="Notification message"
            disabled={busy}
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
          {loading ? <div role="status" aria-label="Loading campaign history"><Loader2 className="h-6 w-6 animate-spin" /></div> : error ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p>Could not load campaign history: {error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setRevision((current) => current + 1)}>Retry campaign history</Button>
            </div>
          ) : (
            <DataTable columns={columns} rows={campaigns} rowKey={(r) => r.campaign_id} emptyMessage="No notification campaigns sent yet." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
