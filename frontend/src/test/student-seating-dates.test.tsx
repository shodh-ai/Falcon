import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudentExamsPage from '@/app/(portals)/student/exams/page';

const { examsApi, academicsApi, api, user } = vi.hoisted(() => ({
  examsApi: { schedule: vi.fn(), eligibility: vi.fn(), myApplications: vi.fn(), reEvaluationSources: vi.fn() },
  academicsApi: { studentResults: vi.fn() }, api: { get: vi.fn() }, user: { user_id: 'synthetic-seated-student' },
}));
vi.mock('@/lib/api/api.exams', () => ({ examsApi }));
vi.mock('@/lib/api/api.academics', () => ({ academicsApi }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'synthetic-token', user }) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/student-demo-mode', () => ({ isStudentDemoModeEnabled: () => false }));

beforeEach(() => {
  examsApi.schedule.mockReset().mockResolvedValue([{ exam_schedule_id: 'synthetic-exam', exam_type: 'END_TERM', subject_id: 1, exam_date: '2026-10-21', start_time: '09:00:00', end_time: '12:00:00', venue: 'Synthetic Block — Hall 1' }]);
  examsApi.eligibility.mockReset().mockResolvedValue({ eligible: true, attendance_percent: 100, reasons: [] });
  examsApi.myApplications.mockReset().mockResolvedValue([]);
  examsApi.reEvaluationSources.mockReset().mockResolvedValue([]);
  academicsApi.studentResults.mockReset().mockResolvedValue([]);
  api.get.mockReset();
});

describe('Student examination seating dates', () => {
  it.each(['2026-10-20T18:30:00.000Z', '2026-10-21'])('shows the same campus date in seating cards and schedule for %s', async (examDate) => {
    api.get.mockResolvedValue({ seating: [{ exam_name: 'Synthetic examination', exam_date: examDate, block: 'Synthetic Block', room: 'Hall 1', seat: 'A1', seat_revealed: true }] });
    render(<StudentExamsPage />);
    await screen.findByText('Synthetic examination');
    const expected = new Date('2026-10-20T18:30:00.000Z').toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
    });
    expect(screen.getAllByText(expected)).toHaveLength(3);
    expect(screen.queryByText(examDate, { exact: true })).toBeNull();
    expect(screen.getByText('Block Synthetic Block, Room Hall 1, Seat A1')).toBeTruthy();
  });
});
