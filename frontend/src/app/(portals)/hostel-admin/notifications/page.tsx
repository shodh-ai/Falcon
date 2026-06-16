'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { HostelScopeBar } from '@/components/hostel/HostelScopeBar';
import { toast } from '@/lib/notifications/falcon-toast';

export default function HostelNotificationsPage() {
  const api = useAuthedApi();
  const [hostelId, setHostelId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [sendSms, setSendSms] = useState(false);

  async function send() {
    if (!title.trim() || !message.trim()) {
      toast.error('Title and message required');
      return;
    }
    const hostel_ids = hostelId ? [hostelId] : [];
    if (!hostel_ids.length) {
      const all = await api.get<Array<{ hostel_id: string }>>('/api/hostel-admin/hostels');
      hostel_ids.push(...all.map((h) => h.hostel_id));
    }
    try {
      await api.post('/api/hostel-admin/broadcasts', {
        title,
        message,
        hostel_ids,
        send_email: sendEmail,
        send_sms: sendSms,
      });
      toast.success('Broadcast queued for residents');
      setTitle('');
      setMessage('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Notifications Engine</h1>
      <p className="text-sm text-muted-foreground">Mass alerts to hostel residents (in-app; email/SMS hooks)</p>

      <HostelScopeBar value={hostelId} onChange={setHostelId} />

      <Input placeholder="Alert title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        className="min-h-[120px] w-full rounded-lg border px-3 py-2 text-sm"
        placeholder="e.g. Water supply cut at 2 PM"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
        Send Email
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
        Send SMS
      </label>

      <Button className="bg-sgvu-navy" onClick={() => void send()}>
        Send Alert
      </Button>
    </div>
  );
}
