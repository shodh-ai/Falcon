'use client';

import { Select } from '@/components/ui/select';
import { FormEvent, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
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
import { inclusiveCalendarDays, timeRangeMinutes } from '@/lib/quick-action-dates';

type ModalKind = 'leave' | 'od' | 'ticket' | 'room' | null;
type QuickActionKey = Exclude<ModalKind, null> | 'meeting';

export function QuickActionMenu() {
  const api = useAuthedApi();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const isPresidentPortal = pathname?.startsWith('/president');
  const isChairmanOnLeadership =
    (user?.primaryRole ?? user?.role ?? '').toLowerCase() === 'chairman' && pathname?.startsWith('/leadership');

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
  const [odForm, setOdForm] = useState({ start_date: '', end_date: '', start_time: '', end_time: '', reason: '' });
  const [ticketForm, setTicketForm] = useState({ category: 'IT', subject: '', description: '' });
  const [roomForm, setRoomForm] = useState({ date: '', slot: '10:00', end: '11:00', room: '', purpose: '' });
  const roomDuration = timeRangeMinutes(roomForm.slot, roomForm.end);

  async function submitLeave(e: FormEvent) {
    e.preventDefault();
    if (inclusiveCalendarDays(leaveForm.start_date, leaveForm.end_date) === null) {
      toast.error('End Date must be on or after Start Date.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(workforceRequestsApi(user, pathname), { request_type: 'LEAVE', ...leaveForm });
      toast.success('Leave request submitted');
      window.dispatchEvent(new Event('falcon:notifications-refresh'));
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
    if (inclusiveCalendarDays(odForm.start_date, odForm.end_date) === null) {
      toast.error('End Date must be on or after Start Date.');
      return;
    }
    if ((odForm.start_time || odForm.end_time) && (!odForm.start_time || !odForm.end_time || odForm.start_date !== odForm.end_date || odForm.start_time >= odForm.end_time)) {
      toast.error('For a timed OD, select one date and both departure and return times in order.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(workforceRequestsApi(user, pathname), {
        request_type: 'ON_DUTY',
        leave_type: 'OD',
        start_date: odForm.start_date,
        end_date: odForm.end_date,
        start_time: odForm.start_time || undefined,
        end_time: odForm.end_time || undefined,
        reason: odForm.reason,
      });
      toast.success('On-duty request submitted');
      window.dispatchEvent(new Event('falcon:notifications-refresh'));
      setOpen(null);
      setOdForm({ start_date: '', end_date: '', start_time: '', end_time: '', reason: '' });
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
      toast.success('Helpdesk ticket submitted');
      window.dispatchEvent(new Event('falcon:notifications-refresh'));
      setOpen(null);
      setTicketForm({ category: 'IT', subject: '', description: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRoom(e: FormEvent) {
    e.preventDefault();
    if (timeRangeMinutes(roomForm.slot, roomForm.end) === null) {
      toast.error('Meeting End Time must be after Meeting Start Time.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/helpdesk/tickets', {
        category: 'FACILITIES',
        subject: `Meeting room request for ${roomForm.date}`,
        description: `Meeting date: ${roomForm.date}; start: ${roomForm.slot}; end: ${roomForm.end}; preferred room: ${roomForm.room.trim() || 'any suitable room'}; purpose: ${roomForm.purpose.trim()}`,
      });
      toast.success('Facilities request submitted. The room is not booked until confirmed.');
      window.dispatchEvent(new Event('falcon:notifications-refresh'));
      setOpen(null);
      setRoomForm({ date: '', slot: '10:00', end: '11:00', room: '', purpose: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit the room request');
    } finally {
      setSubmitting(false);
    }
  }

  const menuItems = useMemo(() => {
    const items: Array<{ key: QuickActionKey; label: string; icon: typeof CalendarDays; show: boolean }> = [
      { key: 'leave', label: 'Apply for Leave / OD', icon: CalendarDays, show: canLeave },
      { key: 'ticket', label: 'Raise IT Ticket', icon: Headphones, show: canTicket },
      { key: 'meeting', label: 'Schedule Executive Meeting', icon: Presentation, show: isPresidentPortal },
      { key: 'room', label: 'Request Meeting Room', icon: Presentation, show: !isPresidentPortal && canTicket },
    ];
    return items.filter((item) => item.show);
  }, [canLeave, canTicket, isPresidentPortal]);

  if (isChairmanOnLeadership) {
    return null;
  }

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
              onClick={() => {
                if (item.key === 'meeting') {
                  router.push('/president/meetings?compose=schedule');
                  return;
                }
                setOpen(item.key);
              }}
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
            <label className="grid gap-1 text-sm font-medium">Start Date
              <Input
              type="date"
              min={workforceMinDate()}
              value={leaveForm.start_date}
              onChange={(e) => setLeaveForm((f) => ({ ...f, start_date: e.target.value }))}
              required
              />
              <span className="text-xs font-normal text-muted-foreground">The first day of the leave period.</span>
            </label>
            <label className="grid gap-1 text-sm font-medium">End Date
              <Input
              type="date"
              min={leaveForm.start_date || workforceMinDate()}
              value={leaveForm.end_date}
              onChange={(e) => setLeaveForm((f) => ({ ...f, end_date: e.target.value }))}
              required
              />
              <span className="text-xs font-normal text-muted-foreground">The last day of the leave period.</span>
            </label>
            <p className="text-xs text-muted-foreground">{inclusiveCalendarDays(leaveForm.start_date, leaveForm.end_date) ? `${inclusiveCalendarDays(leaveForm.start_date, leaveForm.end_date)} calendar day(s) selected. Choose the same date twice for a single day; HR policy determines chargeable leave.` : 'Select a start and end date to see the duration.'}</p>
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
            <label className="grid gap-1 text-sm font-medium">Start Date
              <Input
              type="date"
              min={workforceMinDate()}
              value={odForm.start_date}
              onChange={(e) => setOdForm((f) => ({ ...f, start_date: e.target.value }))}
              required
              />
              <span className="text-xs font-normal text-muted-foreground">The first day of the on-duty period.</span>
            </label>
            <label className="grid gap-1 text-sm font-medium">End Date
              <Input
              type="date"
              min={odForm.start_date || workforceMinDate()}
              value={odForm.end_date}
              onChange={(e) => setOdForm((f) => ({ ...f, end_date: e.target.value }))}
              required
              />
              <span className="text-xs font-normal text-muted-foreground">The last day of the on-duty period.</span>
            </label>
            <p className="text-xs text-muted-foreground">{inclusiveCalendarDays(odForm.start_date, odForm.end_date) ? `${inclusiveCalendarDays(odForm.start_date, odForm.end_date)} calendar day(s) selected.` : 'Select a start and end date to see the duration.'} Times are optional for a single-day OD.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-sm font-medium">Departure Time<Input type="time" value={odForm.start_time} onChange={(e) => setOdForm((f) => ({ ...f, start_time: e.target.value }))} /></label>
              <label className="grid gap-1 text-sm font-medium">Expected Return Time<Input type="time" value={odForm.end_time} onChange={(e) => setOdForm((f) => ({ ...f, end_time: e.target.value }))} /></label>
            </div>
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
            <DialogTitle>Request Meeting Room</DialogTitle>
            <DialogDescription>Request is routed to facilities for confirmation.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitRoom} className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium">Meeting Date
              <Input
              type="date"
              min={workforceMinDate()}
              value={roomForm.date}
              onChange={(e) => setRoomForm((f) => ({ ...f, date: e.target.value }))}
              required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">Meeting Start Time
              <Input
              type="time"
              value={roomForm.slot}
              onChange={(e) => setRoomForm((f) => ({ ...f, slot: e.target.value }))}
              required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">Meeting End Time
              <Input type="time" value={roomForm.end} onChange={(e) => setRoomForm((f) => ({ ...f, end: e.target.value }))} required />
            </label>
            <p className="text-xs text-muted-foreground">{roomDuration === null ? 'End time must be after start time.' : `Requested duration: ${Math.floor(roomDuration / 60)} hour(s) ${roomDuration % 60} minute(s).`}</p>
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
            <Button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Send room request'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
