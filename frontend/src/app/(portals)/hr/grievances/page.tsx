'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useAuthedApi } from '@/lib/api';

type Grievance = {
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
};

const statusConfig: Record<string, { color: string; icon: typeof Clock; label: string }> = {
  PENDING: { color: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock, label: 'Pending' },
  IN_PROGRESS: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Loader2, label: 'In Progress' },
  RESOLVED: { color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2, label: 'Resolved' },
  REJECTED: { color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle, label: 'Rejected' },
};

function SlaTimer({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;
  const remaining = new Date(deadline).getTime() - Date.now();
  if (remaining <= 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
        <AlertTriangle className="h-3 w-3" /> SLA BREACHED
      </span>
    );
  }
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const urgent = hours < 6;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        urgent ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
      }`}
    >
      <Clock className="h-3 w-3" /> {hours}h {mins}m left
    </span>
  );
}

function EscalationBadge({ level }: { level: number }) {
  if (!level) return null;
  const labels = ['', 'Faculty', 'HOD', 'Vice Chancellor', 'Leadership'];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
      ↑ Escalated to {labels[level] ?? `Level ${level}`}
    </span>
  );
}

export default function HrGrievancesPage() {
  const api = useAuthedApi();
  const [tickets, setTickets] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'RESOLVED'>('ALL');

  useEffect(() => {
    void api
      .get<Grievance[]>('/api/helpdesk/tickets/hr-grievances')
      .then(setTickets)
      .catch((e: Error) => {
        console.error('Failed to load HR grievances:', e);
        toast.error(e.message || 'Failed to load grievances');
        setTickets([]);
      })
      .finally(() => setLoading(false));
  }, [api]);

  const filtered =
    filter === 'ALL' ? tickets : tickets.filter((t) => t.status === filter);

  const pendingCount = tickets.filter((t) => t.status === 'PENDING').length;
  const resolvedCount = tickets.filter((t) => t.status === 'RESOLVED').length;
  const breachedCount = tickets.filter(
    (t) => t.sla_deadline && new Date(t.sla_deadline).getTime() < Date.now() && t.status === 'PENDING',
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-sgvu-navy">
          Grievances Escalation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          HR / Payroll & Facilities tickets raised by staff across the university.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-2xl font-black text-sgvu-navy">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pending Tickets</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-gradient-to-br from-red-50 to-white">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-black text-sgvu-navy">{breachedCount}</p>
              <p className="text-xs text-muted-foreground">SLA Breached</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="text-2xl font-black text-sgvu-navy">{resolvedCount}</p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['ALL', 'PENDING', 'RESOLVED'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              filter === f
                ? 'bg-sgvu-navy text-white shadow-md'
                : 'bg-sgvu-surface text-sgvu-navy hover:bg-sgvu-navy/10'
            }`}
          >
            {f === 'ALL' ? 'All Tickets' : f === 'PENDING' ? 'Open' : 'Resolved'}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="flex min-h-[20vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading grievances…
        </div>
      ) : !filtered.length ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No grievance tickets found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => {
            const cfg = statusConfig[t.status] ?? statusConfig.PENDING;
            const StatusIcon = cfg.icon;
            return (
              <Link
                key={t.ticket_id}
                href={`/hr/grievances/${t.ticket_id}`}
                className="group block"
              >
                <Card className="transition-all hover:shadow-md hover:ring-1 hover:ring-sgvu-gold/30">
                  <CardContent className="flex items-start gap-4 p-4">
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.color}`}
                    >
                      <StatusIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {t.ticket_ref}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase"
                        >
                          {t.category}
                        </Badge>
                        {t.status === 'PENDING' && (
                          <SlaTimer deadline={t.sla_deadline} />
                        )}
                        <EscalationBadge level={t.escalation_level} />
                      </div>
                      <h3 className="mt-1 truncate text-sm font-semibold text-sgvu-navy group-hover:text-sgvu-gold transition-colors">
                        {t.subject}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Raised by{' '}
                        <span className="font-medium text-sgvu-navy">
                          {t.raised_by_name}
                        </span>{' '}
                        ({t.raised_by_role}) ·{' '}
                        {new Date(t.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {t.assigned_to_name
                          ? ` · Assigned to ${t.assigned_to_name}`
                          : ''}
                      </p>
                    </div>
                    <Badge className={cfg.color + ' border text-[10px]'}>
                      {cfg.label}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
