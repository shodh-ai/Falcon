import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FacultyObserverDashboard } from '../FacultyObserverDashboard';
import { FacultyDashboardWorkspace } from '../FacultyDashboardWorkspace';
import FacultyTimetablePage from '@/app/(portals)/faculty/timetable/page';

const mocks = vi.hoisted(() => ({ get: vi.fn(), department: { activeDeptId: 43, loading: false } }));
const api = { get: mocks.get };
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { read_only_academic_view: true } }) }));
vi.mock('@/components/faculty/TeachingDepartmentContext', () => ({ useTeachingDepartment: () => mocks.department }));
vi.mock('@/components/faculty/useFacultyCourses', () => ({
  useFacultyCourses: () => ({ courses: [], loading: false, error: null }),
  uniqueFacultyCoursesByCourseId: (courses: unknown[]) => courses,
}));

describe('Faculty academic observer dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.department.loading = false;
    mocks.get.mockImplementation((path: string) => Promise.resolve(path.includes('courses')
      ? [{ course_id: 'course-1', course_code: 'BP106T', course_name: 'Chemistry' }]
      : [{ timetable_id: 'slot-1', course_code: 'BP106T', course_name: 'Chemistry', start_time: '10:50:00', end_time: '11:40:00', room: 'LT-27', student_count: 96 }]));
  });

  it('loads only permitted academic APIs and shows returned data', async () => {
    render(<FacultyObserverDashboard />);
    await screen.findByText('10:50–11:40 · LT-27 · 96 students');
    expect(screen.getAllByText('BP106T · Chemistry')).toHaveLength(2);
    expect(mocks.get.mock.calls.map(([path]) => path)).toEqual([
      '/api/academics/faculty/workspaces/courses?deptId=43',
      '/api/academics/faculty/timetable/today?deptId=43',
    ]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mounts the observer view instead of the standard faculty widget loader', async () => {
    render(<FacultyDashboardWorkspace />);
    await screen.findByText('10:50–11:40 · LT-27 · 96 students');
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: 'Academic observer dashboard' })).toBeInTheDocument();
  });

  it('loads the timetable without requesting private adjustments or showing write controls', async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(path.includes('/stats') ? null : []));
    render(<FacultyTimetablePage />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(mocks.get.mock.calls.every(([path]) => !path.includes('adjustments'))).toBe(true);
    expect(screen.queryByText('Schedule change request')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit for HoD approval' })).not.toBeInTheDocument();
  });

  it('does not disguise a genuine authorized API failure as an empty roster', async () => {
    mocks.get.mockRejectedValue(new Error('Academic data unavailable'));
    render(<FacultyObserverDashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Academic data unavailable');
    expect(screen.queryByText(/No assigned courses/)).not.toBeInTheDocument();
  });

  it('waits for the teaching scope before requesting data', async () => {
    mocks.department.loading = true;
    render(<FacultyObserverDashboard />);
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
