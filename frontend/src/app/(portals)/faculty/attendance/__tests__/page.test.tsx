import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyAttendancePage from '../page';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  department: 1,
}));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/faculty/TeachingDepartmentContext', () => ({
  useTeachingDepartment: () => ({ activeDeptId: fixtures.department, loading: false }),
}));
vi.mock('@/lib/faculty-demo-mode', () => ({
  withFacultyDemoFallback: (live: unknown) => live,
  isEmptyArray: (value: unknown) => Array.isArray(value) && value.length === 0,
  isFacultyDemoSmokeId: () => false,
}));

function course(code: string) {
  return {
    timetable_id: `timetable-${code}`, course_id: `course-${code}`,
    course_code: code, course_name: `Course ${code}`, room: 'Room 1',
    start_time: '09:00', end_time: '10:00', day_of_week: 1,
  };
}

beforeEach(() => {
  fixtures.department = 1;
  fixtures.api.get.mockReset();
  fixtures.api.post.mockReset();
});

describe('copying attendance across a class or date change', () => {
  it.each(['class', 'date', 'unchanged'])('applies a copy only to its original selection (%s)', async (change) => {
    let resolveCopy!: (value: unknown) => void;
    const copied = new Promise((resolve) => { resolveCopy = resolve; });
    fixtures.api.get.mockImplementation((url: string) => {
      if (url.includes('/timetable/today')) return Promise.resolve([course('ONE101'), course('TWO101')]);
      if (url.includes('/previous-session')) return copied;
      if (url.endsWith('/students')) return Promise.resolve([{ student_id: 'student-1', name: 'Test Student', roll_number: 'TEST001' }]);
      if (url.includes('/attendance/analytics')) return Promise.resolve(null);
      return Promise.resolve({ locked: false, attendance_data: [] });
    });
    const view = render(<FacultyAttendancePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Take Same Attendance as Previous' }));

    if (change === 'class') fireEvent.click(screen.getByRole('button', { name: /TWO101/ }));
    else if (change === 'date') fireEvent.change(view.container.querySelector('input[type="date"]')!, { target: { value: '2026-10-01' } });
    await screen.findByText('1 present · 0 absent · 1 total');
    await act(async () => { resolveCopy({ attendance_data: [{ student_id: 'student-1', status: 'ABSENT' }] }); });

    expect(screen.getByText(change === 'unchanged' ? '0 present · 1 absent · 1 total' : '1 present · 0 absent · 1 total')).toBeInTheDocument();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });
});
afterEach(cleanup);

describe('attendance department changes during fallback loading', () => {
  it.each(['empty today', 'failed today', 'failed fallback'])(
    'ignores the previous department after %s',
    async (scenario) => {
      let resolveWeekly!: (rows: ReturnType<typeof course>[]) => void;
      let rejectWeekly!: (error: Error) => void;
      const weekly = new Promise<ReturnType<typeof course>[]>((resolve, reject) => {
        resolveWeekly = resolve;
        rejectWeekly = reject;
      });
      fixtures.api.get.mockImplementation((url: string) => {
        if (url.includes('/timetable/today?deptId=1')) {
          return scenario === 'empty today' ? Promise.resolve([]) : Promise.reject(new Error('Old department unavailable'));
        }
        if (url.includes('/workspaces/timetable?deptId=1')) return weekly;
        if (url.includes('/timetable/today?deptId=2')) return Promise.resolve([course('NEW101')]);
        if (url.endsWith('/students')) return Promise.resolve([]);
        if (url.includes('/attendance/analytics')) return Promise.resolve(null);
        return Promise.resolve({ locked: false, attendance_data: [] });
      });

      const view = render(<FacultyAttendancePage />);
      await waitFor(() => expect(fixtures.api.get).toHaveBeenCalledWith(
        '/api/academics/faculty/workspaces/timetable?deptId=1',
      ));
      fixtures.department = 2;
      view.rerender(<FacultyAttendancePage />);
      await screen.findByRole('button', { name: /NEW101/ });

      await act(async () => {
        if (scenario === 'failed fallback') rejectWeekly(new Error('Old fallback failed'));
        else resolveWeekly([course('OLD101')]);
      });

      expect(screen.getByRole('button', { name: /NEW101/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /OLD101/ })).not.toBeInTheDocument();
      expect(screen.queryByText('Old department unavailable')).not.toBeInTheDocument();
      expect(fixtures.api.get).not.toHaveBeenCalledWith('/api/academics/faculty/course/course-OLD101/students');
      expect(fixtures.api.post).not.toHaveBeenCalled();
    },
  );
});
