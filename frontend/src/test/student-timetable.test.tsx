import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TimetablePage from '@/app/(portals)/student/timetable/page';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/student-demo-mode', () => ({ isStudentDemoModeEnabled: () => false }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/components/student/StudentPageShell', () => ({
  StudentPageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('published student timetable', () => {
  it('shows a readable day schedule with only the confirmed practical', async () => {
    const base = {
      course_id: 'course', course_code: 'CODE', room: 'LT-24',
      faculty_name: 'Faculty', day_of_week: 1, is_virtual: false,
      live_join_url: null, session_date: null, attendance_status: null,
    };
    api.get.mockResolvedValue({
      week_start: '2026-10-12',
      week_dates: [{ day_of_week: 1, label: 'Mon', date: '2026-10-12' }],
      slots: [
        { ...base, section: 'A', timetable_id: 'one', course_name: 'Early theory', start_time: '10:00:00', end_time: '10:50:00' },
        { ...base, section: 'A', timetable_id: 'two', course_name: 'Later theory', start_time: '10:50:00', end_time: '11:40:00' },
        { ...base, section: 'BATCH-A', timetable_id: 'three', course_name: 'Practical A', start_time: '13:30:00', end_time: '16:30:00' },
      ],
      pending_practical_batches: [],
      conflict_count: 0,
    });
    render(<TimetablePage />);
    await screen.findByRole('heading', { name: /Mon, 12 Oct/i });
    for (const name of ['Early theory', 'Later theory', 'Practical A']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: /Practical A/ }).textContent).toContain('1:30 PM');
    expect(screen.getByRole('button', { name: /Practical A/ }).textContent).toContain('Batch A');
    expect(screen.queryByText('Practical B')).toBeNull();
  });

  it('explains missing practicals without inventing a batch', async () => {
    api.get.mockResolvedValue({
      week_start: '2026-10-12',
      week_dates: [{ day_of_week: 1, label: 'Mon', date: '2026-10-12' }],
      slots: [],
      pending_practical_batches: [{ course_id: 'course', course_code: 'BP107P', course_name: 'General Pharmacy Practical' }],
      conflict_count: 0,
    });
    render(<TimetablePage />);
    expect(await screen.findByText('Practical batch assignment pending')).toBeTruthy();
    expect(screen.getByText(/BP107P/)).toBeTruthy();
    expect(screen.getByText('No confirmed classes')).toBeTruthy();
  });
});
