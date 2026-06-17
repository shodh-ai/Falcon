'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Send,
  Shield,
  User,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type GrievanceDetail = {
  ticket_id: string;
  ticket_ref: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  escalation_level: number;
  created_at: string;
  sla_deadline: string | null;
  resolved_at: string | null;
  rejection_reason: string | null;
  raised_by_name: string;
  raised_by_email: string;
  raised_by_role: string;
  assigned_to_name: string | null;
  conversation: Array<{
    sender_user_id: string;
    sender_role: string;
    message: string;
    sent_at: string;
  }> | null;
};

function SlaInfo({ deadline, status }: { deadline: string | null; status: string }) {
  if (!deadline || status === 'RESOLVED' || status === 'REJECTED') return null;
  const remaining = new Date(deadline).getTime() - Date.now();
  if (remaining <= 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <div>
          <p className="font-bold">SLA Breached</p>
          <p className="text-xs">Deadline was {new Date(deadline).toLocaleString('en-IN')}</p>
        </div>
      </div>
    );
  }
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const urgent = hours < 6;
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
        urgent
          ? 'border-orange-200 bg-orange-50 text-orange-800'
          : 'border-sky-200 bg-sky-50 text-sky-800'
      }`}
    >
      <Clock className="h-5 w-5 shrink-0" />
      <div>
        <p className="font-bold">{hours}h {mins}m remaining</p>
        <p className="text-xs">Auto-escalation at {new Date(deadline).toLocaleString('en-IN')}</p>
      </div>
    </div>
  );
}

function EscalationTrail({ level }: { level: number }) {
  const steps = [
    { label: 'HR Admin', threshold: 0 },
    { label: 'Vice Chancellor', threshold: 3 },
    { label: 'Leadership', threshold: 4 },
  ];
  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => {
        const active = level >= step.threshold;
        const isCurrent = i === steps.length - 1
          ? level >= step.threshold
          : level >= step.threshold && level < steps[i + 1].threshold;
        return (
          <div key={step.label} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={`h-0.5 w-6 ${
                  active ? 'bg-sgvu-gold' : 'bg-gray-200'
                }`}
              />
            )}
            <div
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition-all ${
                isCurrent
                  ? 'bg-sgvu-navy text-white ring-2 ring-sgvu-gold'
                  : active
                    ? 'bg-sgvu-gold/20 text-sgvu-navy'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              <Shield className="h-3 w-3" />
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function GrievanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const api = useAuthedApi();
  const [ticket, setTicket] = useState<GrievanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadTicket() {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.get<GrievanceDetail>(
        `/api/helpdesk/tickets/hr-grievances/${encodeURIComponent(id)}`,
      );
      setTicket(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ticket not found');
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTicket();
  }, [api, id]);

  async function handleResolve() {
    if (!ticket || !message.trim()) {
      toast.error('Please enter a resolution comment before resolving.');
      return;
    }
    setSubmitting(true);
    try {
      // First add the message, then resolve
      await api.post(`/api/helpdesk/tickets/${ticket.ticket_id}/messages`, {
        message: message.trim(),
      });
      await api.patch(`/api/helpdesk/tickets/${ticket.ticket_id}/status`, {
        status: 'RESOLVED',
      });
      toast.success('Grievance resolved successfully!');
      setMessage('');
      await loadTicket();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to resolve');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!ticket || !message.trim() || message.trim().length < 10) {
      toast.error('Please enter a rejection reason (min 10 chars) before rejecting.');
      return;
    }
    setSubmitting(true);
    try {
      await api.patch(`/api/helpdesk/tickets/${ticket.ticket_id}/status`, {
        status: 'REJECTED',
        rejection_reason: message.trim(),
      });
      toast.success('Grievance rejected.');
      setMessage('');
      await loadTicket();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reject');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendMessage() {
    if (!ticket || !message.trim()) {
      toast.error('Please enter a message.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/api/helpdesk/tickets/${ticket.ticket_id}/messages`, {
        message: message.trim(),
      });
      toast.success('Message sent.');
      setMessage('');
      await loadTicket();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send message');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading grievance…
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-sgvu-navy/40" />
        <h1 className="text-lg font-semibold text-sgvu-navy">Grievance not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error ?? 'This ticket may not exist or you lack permission.'}
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link href="/hr/grievances">Back to grievances</Link>
        </Button>
      </div>
    );
  }

  const isOpen = ticket.status === 'PENDING' || ticket.status === 'IN_PROGRESS';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/hr/grievances">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
        <Badge variant="outline" className="font-mono text-xs">
          {ticket.ticket_ref}
        </Badge>
        <Badge
          className={
            ticket.status === 'RESOLVED'
              ? 'bg-emerald-100 text-emerald-800'
              : ticket.status === 'REJECTED'
                ? 'bg-red-100 text-red-800'
                : 'bg-amber-100 text-amber-800'
          }
        >
          {ticket.status}
        </Badge>
      </div>

      {/* SLA & Escalation */}
      <SlaInfo deadline={ticket.sla_deadline} status={ticket.status} />
      {ticket.escalation_level > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Escalation Trail
            </p>
            <EscalationTrail level={ticket.escalation_level} />
          </CardContent>
        </Card>
      )}

      {/* Ticket details */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-gradient-to-r from-sgvu-navy/5 to-transparent pb-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-sgvu-gold">
            <AlertTriangle className="h-3.5 w-3.5" />
            {ticket.category === 'HR' ? 'HR / Payroll Grievance' : 'Facilities Grievance'}
          </div>
          <CardTitle className="mt-1 text-xl font-black text-sgvu-navy">
            {ticket.subject}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Raised by</p>
                <p className="font-medium text-sgvu-navy">
                  {ticket.raised_by_name}{' '}
                  <span className="text-xs text-muted-foreground">
                    ({ticket.raised_by_role})
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Filed on</p>
                <p className="font-medium text-sgvu-navy">
                  {new Date(ticket.created_at).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-sgvu-surface/30 p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {ticket.description}
            </p>
          </div>

          {ticket.resolved_at && (
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Resolved on {new Date(ticket.resolved_at).toLocaleString('en-IN')}
            </div>
          )}
          {ticket.rejection_reason && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="text-xs font-bold">Rejection reason:</p>
              <p className="mt-1">{ticket.rejection_reason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conversation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageSquare className="h-4 w-4 text-sgvu-gold" />
            Conversation & Resolution Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ticket.conversation && ticket.conversation.length > 0 ? (
            <ul className="space-y-2">
              {ticket.conversation.map((msg, i) => (
                <li
                  key={`${msg.sent_at}-${i}`}
                  className="rounded-xl border border-border/60 bg-sgvu-surface/30 p-3 text-sm"
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {msg.sender_role} ·{' '}
                    {new Date(msg.sent_at).toLocaleString('en-IN')}
                  </p>
                  <p className="mt-1">{msg.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No messages yet. Add a resolution comment below.
            </p>
          )}

          {/* Action area */}
          {isOpen && (
            <div className="space-y-3 rounded-xl border-2 border-dashed border-sgvu-gold/30 bg-sgvu-gold/5 p-4">
              <textarea
                className="min-h-[100px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sgvu-gold"
                placeholder="Type your resolution comment or message…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void handleResolve()}
                  disabled={submitting || !message.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {submitting ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                  )}
                  Resolve Issue
                </Button>
                <Button
                  onClick={() => void handleSendMessage()}
                  disabled={submitting || !message.trim()}
                  variant="outline"
                >
                  <Send className="mr-1 h-4 w-4" /> Send Message
                </Button>
                <Button
                  onClick={() => void handleReject()}
                  disabled={submitting || !message.trim()}
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  <XCircle className="mr-1 h-4 w-4" /> Reject
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
