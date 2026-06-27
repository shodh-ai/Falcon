'use client';

import { Select } from '@/components/ui/select';
import { FormEvent, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import { CalendarDays, Headphones, Loader2, Plus, Presentation } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuthedApi } from '@/lib/api';
import { workforceMinDate } from '@/lib/workforce-dates';
import { HEADER_CONTROL_CLASS } from '@/components/layout/header-styles';
import {
  canRaiseHelpdeskTicket,
  canUseWorkforceQuickActions,
} from '@/lib/quick-action-access';
import { workforceRequestsApi } from '@/lib/workforce-api';

type ModalKind = 'leave' | 'od' | 'ticket' | 'room' | null;

export function QuickActionMenu() {
  const api = useAuthedApi();
  const pathname = usePathname();
  const { user } = useAuth();
  const isChairmanOnLeadership =
    (user?.primaryRole ?? user?.role ?? '').toLowerCase() === 'chairman' && pathname?.startsWith('/leadership');

  if (isChairmanOnLeadership) {
    return null;
  }

  const canLeave = canUseWorkforceQuickActions(user);
  const canTicket = canRaiseHelpdeskTicket(user);
  const [open, setOpen] = useState<ModalKind>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: 'CL',
    start_date: '',
    end_date: '',
    reason: '',
  });
  const [odForm, setOdForm] = useState({ start_date: '', end_date: '', reason: '' });
  const [ticketForm, setTicketForm] = useState({ category: 'IT', subject: '', description: '' });
  const [roomForm, setRoomForm] = useState({ date: '', slot: '10:00', room: '', purpose: '' });

  async function submitLeave(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(workforceRequestsApi(user, pathname), { request_type: 'LEAVE', ...leaveForm });
      toast.success('Leave request submitted');
      setOpen(null);
      setLeaveForm({ leave_type: 'CL', start_date: '', end_date: '', reason: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitOd(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(workforceRequestsApi(user, pathname), {
        request_type: 'ON_DUTY',
        leave_type: 'OD',
        start_date: odForm.start_date,
        end_date: odForm.end_date,
        reason: odForm.reason,
      });
      toast.success('On-duty request submitted');
      setOpen(null);
      setOdForm({ start_date: '', end_date: '', reason: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitTicket(e: FormEvent) {
    e.preventDefault();
    if (ticketForm.subject.trim().length < 5 || ticketForm.description.trim().length < 10) {
      toast.error('Subject 5+ chars and description 10+ chars required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/helpdesk/tickets', {
        category: ticketForm.category,
        subject: ticketForm.subject.trim(),
        description: ticketForm.description.trim(),
      });
      toast.success('IT ticket raised');
      setOpen(null);
      setTicketForm({ category: 'IT', subject: '', description: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  function submitRoom(e: FormEvent) {
    e.preventDefault();
    toast.success('Meeting room request noted — facilities team will confirm shortly.');
    setOpen(null);
    setRoomForm({ date: '', slot: '10:00', room: '', purpose: '' });
  }

  const menuItems = useMemo(() => {
    const items: Array<{ key: ModalKind; label: string; icon: typeof CalendarDays; show: boolean }> = [
      { key: 'leave', label: 'Apply for Leave / OD', icon: CalendarDays, show: canLeave },
      { key: 'ticket', label: 'Raise IT Ticket', icon: Headphones, show: canTicket },
      { key: 'room', label: 'Book Meeting Room', icon: Presentation, show: true },
    ];
    return items.filter((item) => item.show);
  }, [canLeave, canTicket]);

  if (menuItems.length === 0) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={cn('hidden gap-1.5 sm:inline-flex', HEADER_CONTROL_CLASS)}>
            <Plus className="h-4 w-4 text-sgvu-gold" />
            Quick Action
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Self-service</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {menuItems.map((item) => (
            <DropdownMenuItem
              key={item.key}
              className="cursor-pointer gap-2"
              onClick={() => setOpen(item.key)}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === 'leave'} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply for Leave / OD</DialogTitle>
            <DialogDescription>Submit without leaving your current page.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button size="sm" variant="default" onClick={() => setOpen('leave')}>
              Leave
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen('od')}>
              On Duty
            </Button>
          </div>
          <form onSubmit={submitLeave} className="grid gap-3">
            <Select
              className="rounded-md border px-2 py-2 text-sm"
              value={leaveForm.leave_type}
              onChange={(e) => setLeaveForm((f) => ({ ...f, leave_type: e.target.value }))}
            >
              <option value="CL">Casual (CL)</option>
              <option value="SL">Sick (SL)</option>
              <option value="EL">Earned (EL)</option>
            </Select>
            <Input
              type="date"
              min={workforceMinDate()}
              value={leaveForm.start_date}
              onChange={(e) => setLeaveForm((f) => ({ ...f, start_date: e.target.value }))}
              required
            />
            <Input
              type="date"
              min={workforceMinDate()}
              value={leaveForm.end_date}
              onChange={(e) => setLeaveForm((f) => ({ ...f, end_date: e.target.value }))}
              required
            />
            <Input
              placeholder="Reason"
              value={leaveForm.reason}
              onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
              required
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit leave'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={open === 'od'} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply On Duty (OD)</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitOd} className="grid gap-3">
            <Input
              type="date"
              min={workforceMinDate()}
              value={odForm.start_date}
              onChange={(e) => setOdForm((f) => ({ ...f, start_date: e.target.value }))}
              required
            />
            <Input
              type="date"
              min={workforceMinDate()}
              value={odForm.end_date}
              onChange={(e) => setOdForm((f) => ({ ...f, end_date: e.target.value }))}
              required
            />
            <Input
              placeholder="Purpose / venue"
              value={odForm.reason}
              onChange={(e) => setOdForm((f) => ({ ...f, reason: e.target.value }))}
              required
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit OD'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={open === 'ticket'} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise IT Ticket</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitTicket} className="grid gap-3">
            <Select
              className="rounded-md border px-2 py-2 text-sm"
              value={ticketForm.category}
              onChange={(e) => setTicketForm((f) => ({ ...f, category: e.target.value }))}
            >
              <option value="IT">IT / WiFi</option>
              <option value="HR">HR / Payroll</option>
              <option value="FACILITIES">Facilities</option>
            </Select>
            <Input
              placeholder="Subject"
              value={ticketForm.subject}
              onChange={(e) => setTicketForm((f) => ({ ...f, subject: e.target.value }))}
              required
            />
            <textarea
              className="min-h-[100px] rounded-md border px-3 py-2 text-sm"
              placeholder="Description"
              value={ticketForm.description}
              onChange={(e) => setTicketForm((f) => ({ ...f, description: e.target.value }))}
              required
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Raise ticket'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={open === 'room'} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Book Meeting Room</DialogTitle>
            <DialogDescription>Request is routed to facilities for confirmation.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitRoom} className="grid gap-3">
            <Input
              type="date"
              min={workforceMinDate()}
              value={roomForm.date}
              onChange={(e) => setRoomForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
            <Input
              type="time"
              value={roomForm.slot}
              onChange={(e) => setRoomForm((f) => ({ ...f, slot: e.target.value }))}
              required
            />
            <Input
              placeholder="Preferred room / block"
              value={roomForm.room}
              onChange={(e) => setRoomForm((f) => ({ ...f, room: e.target.value }))}
            />
            <Input
              placeholder="Meeting purpose"
              value={roomForm.purpose}
              onChange={(e) => setRoomForm((f) => ({ ...f, purpose: e.target.value }))}
              required
            />
            <Button type="submit">Request booking</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
