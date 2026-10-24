import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamCalendar, type CalendarEvent } from '../ExamCalendar';

const event = (id: string, date: string, source = 'CALENDAR'): CalendarEvent => ({
  event_id: id, title: id, event_date: date, event_type: 'DEADLINE', source,
});

const priorTimezone = process.env.TZ;
beforeAll(() => { process.env.TZ = 'Asia/Kolkata'; });
afterAll(() => {
  if (priorTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = priorTimezone;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T00:15:00+05:30'));
});
afterEach(() => vi.useRealTimers());

describe('Examination calendar local dates and navigation', () => {
  it('marks the local day, not the previous UTC day, near India midnight', () => {
    expect(new Date().getDate()).toBe(21);
    render(<ExamCalendar events={[]} />);
    expect(screen.getByText('21', { selector: 'p' }).parentElement).toHaveAttribute('aria-current', 'date');
    expect(screen.getByText('20', { selector: 'p' }).parentElement).not.toHaveAttribute('aria-current');
  });

  it('shows the full local Sunday–Saturday week without shifting it to Saturday–Friday', () => {
    render(<ExamCalendar events={[event('Previous Saturday', '2026-10-17'), event('Current Saturday', '2026-10-24')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Week', exact: true }));
    expect(screen.getByText('Current Saturday')).toBeTruthy();
    expect(screen.queryByText('Previous Saturday')).toBeNull();
  });

  it('moves exactly seven local dates in week view, including across a month boundary', () => {
    render(<ExamCalendar events={[event('Current week', '2026-10-24'), event('Following week', '2026-10-31'), event('November week', '2026-11-07')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Week', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByText('Following week')).toBeTruthy();
    expect(screen.queryByText('Current week')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByText('November week')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByText('Following week')).toBeTruthy();
  });

  it('preserves month and list views and announces the displayed week range', () => {
    render(<ExamCalendar events={[event('October milestone', '2026-10-21')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('November 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'List', exact: true }));
    expect(screen.getByText('October milestone')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Week', exact: true }));
    expect(screen.getByText(/27 Sept.*3 Oct 2026/)).toBeTruthy();
  });

  it('reschedules only calendar-owned events when staff dragging is enabled', () => {
    const reschedule = vi.fn();
    const { rerender } = render(<ExamCalendar events={[event('Scheduled exam', '2026-10-21', 'SCHEDULE')]} draggable onReschedule={reschedule} />);
    const target = () => screen.getByText('22', { selector: 'p' }).parentElement!;
    fireEvent.dragStart(screen.getByTitle('Scheduled exam')); fireEvent.drop(target());
    expect(reschedule).not.toHaveBeenCalled();
    rerender(<ExamCalendar events={[event('Calendar milestone', '2026-10-21')]} draggable={false} onReschedule={reschedule} />);
    fireEvent.dragStart(screen.getByTitle('Calendar milestone')); fireEvent.drop(target());
    expect(reschedule).not.toHaveBeenCalled();
    rerender(<ExamCalendar events={[event('Calendar milestone', '2026-10-21')]} draggable onReschedule={reschedule} />);
    fireEvent.dragStart(screen.getByTitle('Calendar milestone')); fireEvent.drop(target());
    expect(reschedule).toHaveBeenCalledExactlyOnceWith('Calendar milestone', '2026-10-22');
  });

  it('reports local visible ranges only when boundaries change and retains its cursor when events refresh', () => {
    const rangeChanged = vi.fn();
    const { rerender } = render(<ExamCalendar events={[]} onRangeChange={rangeChanged} />);
    expect(rangeChanged).toHaveBeenCalledExactlyOnceWith({ from: '2026-10-01', to: '2026-10-31' });
    rerender(<ExamCalendar events={[event('Refresh', '2026-10-21')]} onRangeChange={(range) => rangeChanged(range)} />);
    expect(rangeChanged).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(rangeChanged).toHaveBeenLastCalledWith({ from: '2026-11-01', to: '2026-11-30' });
    rerender(<ExamCalendar events={[]} draggable={false} onRangeChange={(range) => rangeChanged(range)} />);
    expect(screen.getByText('November 2026')).toBeTruthy();
    expect(rangeChanged).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Week', exact: true }));
    expect(rangeChanged).toHaveBeenLastCalledWith({ from: '2026-11-01', to: '2026-11-07' });
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(rangeChanged).toHaveBeenLastCalledWith({ from: '2026-10-25', to: '2026-10-31' });
  });
});
