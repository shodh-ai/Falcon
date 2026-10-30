import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceWeekNavigator, attendanceDayStatus, attendanceWeekStart, shiftAttendanceDate } from '../AttendanceWeekNavigator';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
const baseProps = { selectedDate: '2026-10-14', today: '2026-10-14', deptId: 43, scopeLoading: false, revision: 0, onSelect: vi.fn() };

describe('Attendance date navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(Array.from({ length: 7 }, (_, index) => ({ date: shiftAttendanceDate('2026-10-12', index), sessions: index === 0
      ? [{ has_saved_attendance: true }, { has_saved_attendance: false, attendance_locked: false }]
      : index === 1 ? [{ has_saved_attendance: true }] : [] })));
  });

  it('distinguishes partly recorded, complete, no-class and upcoming dates', async () => {
    render(<AttendanceWeekNavigator {...baseProps} />);
    const pending = await screen.findByRole('button', { name: '2026-10-12: 1/2 recorded, 1 pending' });
    fireEvent.click(pending);
    expect(baseProps.onSelect).toHaveBeenCalledWith('2026-10-12');
    expect(screen.getByRole('button', { name: '2026-10-13: 1/1 recorded, Complete' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '2026-10-14: No class' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '2026-10-15: Upcoming' })).toBeDisabled();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get.mock.calls.every(([path]) => path.endsWith('deptId=43'))).toBe(true);
  });

  it('does not portray a failed request as a day with no class', async () => {
    api.get.mockRejectedValue(new Error('Offline'));
    render(<AttendanceWeekNavigator {...baseProps} />);
    await screen.findByRole('button', { name: '2026-10-12: Could not load' });
    expect(screen.queryByRole('button', { name: '2026-10-12: No class' })).not.toBeInTheDocument();
  });

  it('reloads statuses after a successful save revision', async () => {
    const view = render(<AttendanceWeekNavigator {...baseProps} />);
    await screen.findByRole('button', { name: '2026-10-12: 1/2 recorded, 1 pending' });
    api.get.mockResolvedValue(Array.from({ length: 7 }, (_, index) => ({ date: shiftAttendanceDate('2026-10-12', index), sessions: [{ has_saved_attendance: true }] })));
    view.rerender(<AttendanceWeekNavigator {...baseProps} revision={1} />);
    await screen.findByRole('button', { name: '2026-10-12: 1/1 recorded, Complete' });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('does not request data before the teaching department has resolved', async () => {
    render(<AttendanceWeekNavigator {...baseProps} scopeLoading />);
    await waitFor(() => expect(api.get).not.toHaveBeenCalled());
  });

  it('labels a locked missing record honestly and treats legacy responses as unknown', () => {
    expect(attendanceDayStatus([{ has_saved_attendance: false, attendance_locked: true }]).detail).toBe('1 not recorded · locked');
    expect(attendanceDayStatus([{}]).label).toBe('Status unavailable');
    expect(attendanceWeekStart('2026-11-01')).toBe('2026-10-26');
    expect(attendanceDayStatus([{awaiting_confirmation:true}]).label).toBe('Awaiting confirmation');
    expect(attendanceDayStatus([{has_saved_attendance:true},{has_saved_attendance:false,awaiting_confirmation:true}]).tone).toBe('pending');
    expect(attendanceDayStatus([{ cancelled: true, has_saved_attendance: false }]).label).toBe('Cancelled');
    expect(attendanceDayStatus([{ has_saved_attendance: true }, { cancelled: true, has_saved_attendance: false }]).detail).toContain('1 cancelled');
  });
});
