'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  UserRound,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuthedApi } from '@/lib/api';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';
import { toast } from '@/lib/notifications/falcon-toast';

type AssignableUser = {
  user_id: string;
  name: string;
  email?: string | null;
  role_name?: string | null;
};

type TicketDetail = {
  ticket_id: string;
  ticket_ref: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
  resolved_at?: string | null;
  rejection_reason?: string | null;
  sla_deadline?: string | null;
  escalation_level?: number | null;
  student_user_id?: string;
  student_name?: string | null;
  assigned_to_user_id?: string | null;
  assigned_to_name?: string | null;
  conversation?: Array<{
    sender_user_id: string;
    sender_role: string;
    message: string;
    sent_at: string;
  }> | null;
};

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Open (Pending)' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'REJECTED', label: 'Rejected' },
];

function statusBadge(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'PENDING') {
    return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Open</Badge>;
  }
  if (normalized === 'IN_PROGRESS') {
    return <Badge className="bg-sky-100 text-sky-900 hover:bg-sky-100">In Progress</Badge>;
  }
  if (normalized === 'RESOLVED') {
    return <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">Resolved</Badge>;
  }
  if (normalized === 'REJECTED') {
    return <Badge className="bg-red-100 text-red-900 hover:bg-red-100">Rejected</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseApiError(err: unknown) {
  if (!(err instanceof Error)) return 'Unable to update this ticket.';
  try {
    const parsed = JSON.parse(err.message) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(', ');
    if (parsed.message) return parsed.message;
  } catch {
    /* plain text */
  }
  return err.message;
}

export function CampusAdminHelpdeskTicketDetail() {
  const params = useParams<{ ticketId: string }>();
  const ticketId = params.ticketId;
  const api = useAuthedApi();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [statusDraft, setStatusDraft] = useState('PENDING');
  const [assigneeDraft, setAssigneeDraft] = useState('');
  const [acting, setActing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'resolve' | 'reject' | 'reopen' | null>(null);

  const isClosed = useMemo(
    () => ticket?.status === 'RESOLVED' || ticket?.status === 'REJECTED',
    [ticket?.status],
  );

  const loadTicket = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    try {
      const [detail, users] = await Promise.all([
        api.get<TicketDetail>(`/api/campus-admin/requests/${encodeURIComponent(ticketId)}`),
        api.get<AssignableUser[]>('/api/campus-admin/requests/assignable-users'),
      ]);
      setTicket(detail);
      setStatusDraft(detail.status);
      setAssigneeDraft(detail.assigned_to_user_id ?? '');
      setAssignees(Array.isArray(users) ? users : []);
    } catch (err) {
      setTicket(null);
      setError(parseApiError(err) || 'Unable to load ticket details.');
    } finally {
      setLoading(false);
    }
  }, [api, ticketId]);

  useEffect(() => {
    void loadTicket();
  }, [loadTicket]);

  async function refreshAfterMutation(successMessage: string) {
    await loadTicket();
    toast.success(successMessage);
  }

  async function handleReply() {
    if (!ticket || !message.trim()) {
      toast.error('Please enter a response before sending.');
      return;
    }
    setActing(true);
    try {
      await api.post(`/api/helpdesk/tickets/${ticket.ticket_id}/messages`, {
        message: message.trim(),
      });
      setMessage('');
      await refreshAfterMutation('Response sent successfully.');
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setActing(false);
    }
  }

  async function handleStatusUpdate() {
    if (!ticket) return;
    if (statusDraft === ticket.status && assigneeDraft === (ticket.assigned_to_user_id ?? '')) {
      toast.error('No changes to save.');
      return;
    }
    setActing(true);
    try {
      await api.patch(`/api/helpdesk/tickets/${ticket.ticket_id}/status`, {
        status: statusDraft,
        assigned_to_user_id: assigneeDraft ? assigneeDraft : null,
      });
      await refreshAfterMutation('Ticket updated successfully.');
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setActing(false);
    }
  }

  async function handleResolve() {
    if (!ticket) return;
    if (!message.trim()) {
      toast.error('Please enter a resolution comment before resolving.');
      return;
    }
    setActing(true);
    try {
      await api.post(`/api/helpdesk/tickets/${ticket.ticket_id}/messages`, {
        message: message.trim(),
      });
      await api.patch(`/api/helpdesk/tickets/${ticket.ticket_id}/status`, {
        status: 'RESOLVED',
      });
      setMessage('');
      setConfirmAction(null);
      await refreshAfterMutation('Ticket resolved successfully.');
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    if (!ticket) return;
    if (message.trim().length < 10) {
      toast.error('Please enter a rejection reason of at least 10 characters.');
      return;
    }
    setActing(true);
    try {
      await api.patch(`/api/helpdesk/tickets/${ticket.ticket_id}/status`, {
        status: 'REJECTED',
        rejection_reason: message.trim(),
      });
      setMessage('');
      setConfirmAction(null);
      await refreshAfterMutation('Ticket rejected.');
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setActing(false);
    }
  }

  async function handleReopen() {
    if (!ticket) return;
    setActing(true);
    try {
      await api.patch(`/api/helpdesk/tickets/${ticket.ticket_id}/status`, {
        status: 'IN_PROGRESS',
      });
      setConfirmAction(null);
      await refreshAfterMutation('Ticket reopened.');
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading ticket…
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="space-y-4 p-6">
        <Button asChild variant="outline" className="h-9">
          <Link href={campusAdminRoutes.operationsRequests}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to inbox
          </Link>
        </Button>
        <Card className="border-destructive/20 bg-white shadow-sm">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">{error ?? 'Ticket not found.'}</p>
            <Button className="mt-3 h-9" variant="outline" onClick={() => void loadTicket()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const conversation = Array.isArray(ticket.conversation) ? ticket.conversation : [];

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="outline" className="h-9 w-fit">
          <Link href={campusAdminRoutes.operationsRequests}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to inbox
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {isClosed ? (
            <Button
              variant="outline"
              className="h-9"
              disabled={acting}
              onClick={() => setConfirmAction('reopen')}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reopen
            </Button>
          ) : (
            <>
              <Button
                className="h-9 bg-emerald-700 hover:bg-emerald-800"
                disabled={acting}
                onClick={() => setConfirmAction('resolve')}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Resolve
              </Button>
              <Button
                variant="outline"
                className="h-9 border-red-200 text-red-700 hover:bg-red-50"
                disabled={acting}
                onClick={() => setConfirmAction('reject')}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-5 md:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">{ticket.subject}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {ticket.ticket_ref} · {ticket.category}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {statusBadge(ticket.status)}
              {ticket.escalation_level ? (
                <Badge variant="outline">Escalation L{ticket.escalation_level}</Badge>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opened</p>
              <p className="mt-1 text-sm text-sgvu-navy">{formatDateTime(ticket.created_at)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last updated</p>
              <p className="mt-1 text-sm text-sgvu-navy">{formatDateTime(ticket.updated_at)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">SLA deadline</p>
              <p className="mt-1 text-sm text-sgvu-navy">{formatDateTime(ticket.sla_deadline)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resolved</p>
              <p className="mt-1 text-sm text-sgvu-navy">{formatDateTime(ticket.resolved_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-6 text-sgvu-navy">{ticket.description}</p>
              {ticket.rejection_reason ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <p className="font-semibold">Rejection reason</p>
                  <p className="mt-1">{ticket.rejection_reason}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4" />
                Activity / Conversation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {conversation.length === 0 ? (
                <p className="text-sm text-muted-foreground">No replies yet.</p>
              ) : (
                <div className="space-y-3">
                  {conversation.map((entry, index) => (
                    <div
                      key={`${entry.sent_at}-${index}`}
                      className="rounded-xl border border-sgvu-navy/10 bg-muted/20 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-sgvu-navy">{entry.sender_role}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(entry.sent_at)}</p>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{entry.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {!isClosed ? (
                <div className="space-y-3 border-t border-sgvu-navy/10 pt-4">
                  <label className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/55">
                    Add response
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    placeholder="Write a response to the requester…"
                    className="w-full rounded-xl border border-sgvu-navy/15 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/40"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button className="h-9" disabled={acting} onClick={() => void handleReply()}>
                      {acting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Reply
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="h-4 w-4" />
                Requester
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-semibold text-sgvu-navy">{ticket.student_name ?? '—'}</p>
            </CardContent>
          </Card>

          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Assignment & Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/55">Status</label>
                <Select
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value)}
                  className="h-10 w-full rounded-xl border-sgvu-navy/15"
                  disabled={acting || isClosed}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/55">Assigned to</label>
                <Select
                  value={assigneeDraft}
                  onChange={(e) => setAssigneeDraft(e.target.value)}
                  className="h-10 w-full rounded-xl border-sgvu-navy/15"
                  disabled={acting || isClosed}
                >
                  <option value="">Unassigned</option>
                  {assignees.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.name}
                      {user.role_name ? ` (${user.role_name})` : ''}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  Current: {ticket.assigned_to_name ?? 'Unassigned'}
                </p>
              </div>
              {!isClosed ? (
                <Button className="h-9 w-full" disabled={acting} onClick={() => void handleStatusUpdate()}>
                  {acting ? 'Saving…' : 'Save changes'}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === 'resolve'
                ? 'Resolve ticket'
                : confirmAction === 'reject'
                  ? 'Reject ticket'
                  : 'Reopen ticket'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === 'resolve'
                ? 'A resolution comment is required and will be sent to the requester.'
                : confirmAction === 'reject'
                  ? 'Provide a rejection reason of at least 10 characters.'
                  : 'This ticket will move back to In Progress.'}
            </DialogDescription>
          </DialogHeader>
          {confirmAction === 'reopen' ? null : (
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder={
                confirmAction === 'reject'
                  ? 'Explain why this ticket is being rejected…'
                  : 'Describe how this ticket was resolved…'
              }
              className="w-full rounded-xl border border-sgvu-navy/15 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/40"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              disabled={acting}
              onClick={() => {
                if (confirmAction === 'resolve') void handleResolve();
                else if (confirmAction === 'reject') void handleReject();
                else void handleReopen();
              }}
            >
              {acting ? 'Working…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
