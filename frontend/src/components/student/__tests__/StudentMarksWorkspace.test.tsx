import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentMarksWorkspace } from '@/components/student/StudentMarksWorkspace';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn() },
  historyGet: vi.fn(),
  profileGet: vi.fn(),
  token: 'student-a',
  demoMode: false,
}));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: mocks.token, user: { user_id: mocks.token, tenant_id: 'test-tenant', role: 'Student' } }),
}));
vi.mock('@/lib/student-demo-mode', () => ({ isStudentDemoModeEnabled: () => mocks.demoMode }));

function history() {
  return {
    // Eight grade points across four credits and six across two credits:
    // 44 weighted points / 6 attempted credits, not the semester mean (7).
    cgpa: 7.33,
    total_credits_earned: 6,
    total_credits_attempted: 6,
    total_grade_points: 44,
    total_semesters: 4,
    current_semester: 3,
    semesters: [
      {
        semester_number: 1, sgpa: 8, credits: 4, credits_earned: 4, credits_attempted: 4,
        courses: [{ course_id: 'course-one', course_code: 'TEST-101', course_name: 'First semester subject', course_type: 'Theory', credits: 4, grade: 'B+', grade_points: 8, status: 'PASS' }],
      },
      {
        semester_number: 2, sgpa: 6, credits: 2, credits_earned: 2, credits_attempted: 2,
        courses: [{ course_id: 'course-two', course_code: 'TEST-201', course_name: 'Second semester subject', course_type: 'Theory', credits: 2, grade: 'C', grade_points: 6, status: 'PASS' }],
      },
    ],
    component_marks_by_semester: [],
    exam_reports: [],
    grade_cards: [],
    backlogs: { uncleared: [] as Array<{ course_id: string; course_code: string; course_name: string; semester: number }>, cleared: [] },
  };
}

function heroSummary() {
  return within(screen.getByRole('region', { name: 'Semester academic summary' }));
}

function heroGpaSummary() {
  const label = heroSummary().getByText(/^(?:Semester \d+ GPA|Semester GPA) \(SGPA\)$/);
  if (!label.parentElement) throw new Error('Semester GPA hero is missing');
  return within(label.parentElement);
}

function heroCard(label: 'Credits earned' | 'Subjects to clear') {
  const tile = heroSummary().getByText(label, { exact: true }).parentElement?.parentElement;
  if (!tile) throw new Error(`${label} hero card is missing`);
  return within(tile);
}

function semesterCredits() {
  const hero = screen.getByRole('region', { name: 'Semester academic summary' });
  const label = screen.getAllByText('Credits earned', { exact: true }).find((element) => !hero.contains(element));
  if (!label?.parentElement) throw new Error('Selected semester credits are missing');
  return within(label.parentElement);
}

function semesterSummary() {
  const label = screen.getByText('Semester GPA (SGPA)', { exact: true });
  if (!label.parentElement) throw new Error('Semester GPA summary is missing');
  return within(label.parentElement);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Student results scorecard', () => {
  beforeEach(() => {
    mocks.token = 'student-a';
    mocks.demoMode = false;
    mocks.historyGet.mockReset().mockResolvedValue(history());
    mocks.profileGet.mockReset().mockResolvedValue({ semester: 3 });
    mocks.api.get.mockReset().mockImplementation((path: string) => {
      if (path === '/api/academics/marks/history') return mocks.historyGet();
      if (path === '/api/student/profile') return mocks.profileGet();
      return Promise.reject(new Error(`Unexpected test request: ${path}`));
    });
  });

  it('defaults to the current semester rather than borrowing a completed semester score or overall CGPA', async () => {
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroSummary().getByText('Semester 3 GPA (SGPA)', { exact: true })).toBeInTheDocument();
    expect(heroGpaSummary().getByText('—', { exact: true })).toBeInTheDocument();
    expect(heroSummary().getByText('Awaiting grades', { exact: true })).toBeInTheDocument();
    expect(heroSummary().queryByText('7.33', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semester 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.api.get).toHaveBeenCalledWith('/api/student/profile');

    fireEvent.click(screen.getByRole('button', { name: 'Semester 2' }));
    expect(heroSummary().getByText('6.00', { exact: true })).toBeInTheDocument();
    expect(semesterSummary().getByText('6.00', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Second semester subject')).toBeInTheDocument();
    expect(screen.queryByText('7.00', { exact: true })).not.toBeInTheDocument();
    expect(mocks.api.get).toHaveBeenCalledWith('/api/academics/marks/history');

    fireEvent.click(screen.getByRole('button', { name: /^(?:Sem|Semester) 1$/ }));
    expect(semesterSummary().getByText('8.00', { exact: true })).toBeInTheDocument();
    expect(heroSummary().getByText('8.00', { exact: true })).toBeInTheDocument();
    expect(heroSummary().queryByText('7.33', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('First semester subject')).toBeInTheDocument();
    expect(screen.queryByText('Second semester subject')).not.toBeInTheDocument();
  });

  it('shows earned credits separately from graded attempted credits when a subject failed', async () => {
    mocks.profileGet.mockResolvedValue({ semester: 2 });
    const payload = history();
    payload.cgpa = 5.33;
    payload.total_credits_earned = 4;
    payload.total_grade_points = 32;
    payload.semesters[1] = {
      ...payload.semesters[1], sgpa: 0, credits_earned: 0,
      courses: [{ ...payload.semesters[1].courses[0], grade: 'F', grade_points: 0, status: 'FAIL' }],
    };
    payload.backlogs.uncleared = [{ course_id: 'course-two', course_code: 'TEST-201', course_name: 'Second semester subject', semester: 2 }];
    mocks.historyGet.mockResolvedValue(payload);
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroSummary().getByText('0.00', { exact: true })).toBeInTheDocument();
    expect(semesterSummary().getByText('0.00', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Failed', { exact: true })).toBeInTheDocument();
    expect(heroCard('Credits earned').getByText('0', { exact: true })).toBeInTheDocument();
    expect(heroCard('Credits earned').queryByText('4', { exact: true })).not.toBeInTheDocument();
    expect(heroCard('Credits earned').queryByText(/6 graded credits/)).not.toBeInTheDocument();
    expect(heroCard('Subjects to clear').getByText('1', { exact: true })).toBeInTheDocument();
    expect(semesterCredits().getByText('0', { exact: true })).toBeInTheDocument();
    expect(semesterCredits().getByText('of 2 graded credits')).toBeInTheDocument();
  });

  it('shows missing CGPA and SGPA as unavailable without borrowing grade-card snapshots', async () => {
    mocks.profileGet.mockResolvedValue({ semester: 2 });
    const payload = history();
    mocks.historyGet.mockResolvedValue({
      ...payload,
      cgpa: null,
      semesters: [{ ...payload.semesters[1], sgpa: null, courses: [] }],
      grade_cards: [{ grade_card_id: 'stale-card', semester: 2, status: 'PUBLISHED', published_at: '2026-10-10T10:00:00Z', payload: { result_stage: 'PROVISIONAL', sgpa: 9.99, cgpa: 9.99 } }],
    });
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroGpaSummary().getByText('—', { exact: true })).toBeInTheDocument();
    expect(semesterSummary().getByText('—', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('0.00', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('9.99', { exact: true })).not.toBeInTheDocument();
  });

  it('preserves an actual zero grade-point average instead of treating it as missing', async () => {
    mocks.profileGet.mockResolvedValue({ semester: 1 });
    const payload = history();
    mocks.historyGet.mockResolvedValue({
      ...payload, cgpa: 0, total_credits_earned: 0, total_credits_attempted: 4, total_grade_points: 0,
      semesters: [{ ...payload.semesters[0], sgpa: 0, credits_earned: 0, courses: [{ ...payload.semesters[0].courses[0], grade: 'F', grade_points: 0, status: 'FAIL' }] }],
    });
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroSummary().getByText('0.00', { exact: true })).toBeInTheDocument();
    expect(semesterSummary().getByText('0.00', { exact: true })).toBeInTheDocument();
  });

  it('uses real per-subject grade points rather than invented weekly mark summaries', async () => {
    mocks.profileGet.mockResolvedValue({ semester: 2 });
    render(<StudentMarksWorkspace />);
    await screen.findByText('Second semester subject');
    const gradePoints = screen.getByText('Grade points', { exact: true }).parentElement;
    expect(gradePoints).not.toBeNull();
    expect(within(gradePoints!).getByText('6.00', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Weekly marks', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Weekly total', { exact: true })).not.toBeInTheDocument();
  });

  it('does not replace an empty published history with demo grades', async () => {
    mocks.demoMode = true;
    mocks.historyGet.mockResolvedValue({ ...history(), cgpa: null, total_credits_earned: 0, total_credits_attempted: 0, total_grade_points: 0, semesters: [] });
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroGpaSummary().getByText('—', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('No subject grades for this semester')).toBeInTheDocument();
    expect(screen.queryByText('8.42', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('0.00', { exact: true })).not.toBeInTheDocument();
  });

  it('reports a failed request safely and retries without showing invented results', async () => {
    mocks.demoMode = true;
    mocks.historyGet.mockRejectedValue(new Error('private database credentials must not leak'));
    render(<StudentMarksWorkspace />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Semester academic summary' })).not.toBeInTheDocument();
    expect(screen.queryByText(/private database credentials/)).not.toBeInTheDocument();
    expect(screen.queryByText('0.00', { exact: true })).not.toBeInTheDocument();
    mocks.historyGet.mockResolvedValue(history());
    fireEvent.click(screen.getByRole('button', { name: 'Retry results' }));
    await waitFor(() => expect(heroSummary().getByText('Semester 3 GPA (SGPA)')).toBeInTheDocument());
    expect(heroGpaSummary().getByText('—', { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('builds semester choices from program metadata rather than a hardcoded eight-semester list', async () => {
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(screen.getAllByRole('button', { name: /^Semester \d+$/ })).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Semester 8' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Semester 4' }));
    expect(screen.getByRole('button', { name: 'Semester 4' })).toHaveAttribute('aria-pressed', 'true');
    expect(semesterSummary().getByText('—', { exact: true })).toBeInTheDocument();
    expect(heroGpaSummary().getByText('—', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('No subject grades for this semester')).toBeInTheDocument();
  });

  it('clears private results immediately on account change and ignores the earlier account response', async () => {
    let resolveOld!: (value: ReturnType<typeof history>) => void;
    mocks.historyGet.mockReturnValueOnce(new Promise<ReturnType<typeof history>>((resolve) => { resolveOld = resolve; }));
    const { rerender } = render(<StudentMarksWorkspace />);
    mocks.token = 'student-b';
    const secondHistory = history();
    secondHistory.semesters[1].sgpa = 4.25;
    mocks.profileGet.mockResolvedValue({ semester: 2 });
    mocks.historyGet.mockResolvedValue(secondHistory);
    rerender(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroSummary().getByText('4.25', { exact: true })).toBeInTheDocument();
    await act(async () => resolveOld(history()));
    await waitFor(() => expect(heroSummary().getByText('4.25', { exact: true })).toBeInTheDocument());
    expect(screen.queryByText('7.33', { exact: true })).not.toBeInTheDocument();
  });

  it('does not offer an unpublished grade card as an official marksheet', async () => {
    mocks.profileGet.mockResolvedValue({ semester: 2 });
    mocks.historyGet.mockResolvedValue({
      ...history(),
      grade_cards: [{ grade_card_id: 'draft-card', semester: 2, status: 'DRAFT', published_at: null, payload: { result_stage: 'FINAL', sgpa: 9.99, cgpa: 9.99 } }],
    });
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(screen.getByText('Awaiting grade card')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(screen.getByRole('button', { name: 'Provisional PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Final PDF' })).toBeDisabled();
    expect(screen.queryByText('9.99', { exact: true })).not.toBeInTheDocument();
  });

  it('uses the profile semester ahead of older history metadata', async () => {
    mocks.profileGet.mockResolvedValue({ semester: 1 });
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroSummary().getByText('Semester 1 GPA (SGPA)')).toBeInTheDocument();
    expect(heroSummary().getByText('8.00', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semester 1' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an ungraded current semester as awaiting grades, not a zero or an older passing GPA', async () => {
    const payload = history();
    mocks.historyGet.mockResolvedValue({
      ...payload,
      backlogs: {
        uncleared: [
          { course_id: 'older-failure', course_code: 'TEST-102', course_name: 'Older failed subject', semester: 1 },
          { course_id: 'second-failure', course_code: 'TEST-202', course_name: 'Second failed subject', semester: 2 },
        ],
        cleared: [],
      },
      semesters: [...payload.semesters, {
        semester_number: 3, sgpa: 0, credits: 4, credits_earned: 0, credits_attempted: 0,
        courses: [{ course_id: 'current-subject', course_code: 'TEST-301', course_name: 'Current semester subject', course_type: 'Theory', credits: 4, grade: '—', grade_points: null, status: 'ENROLLED' }],
      }],
    });
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroSummary().getByText('Semester 3 GPA (SGPA)')).toBeInTheDocument();
    expect(heroGpaSummary().getByText('—', { exact: true })).toBeInTheDocument();
    expect(heroSummary().getByText('Awaiting grades')).toBeInTheDocument();
    expect(semesterSummary().getByText('—', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semester 3' })).not.toHaveTextContent('GPA 0.00');
    expect(screen.getByText('Current semester subject')).toBeInTheDocument();
    expect(screen.queryByText('0.00', { exact: true })).not.toBeInTheDocument();
    expect(heroCard('Credits earned').getByText('0', { exact: true })).toBeInTheDocument();
    expect(heroCard('Credits earned').getByText('Semester 3 · Awaiting results')).toBeInTheDocument();
    expect(semesterCredits().getByText('0', { exact: true })).toBeInTheDocument();
    expect(heroCard('Subjects to clear').getByText('0', { exact: true })).toBeInTheDocument();
    expect(heroCard('Subjects to clear').getByText('Semester 3 · Awaiting results')).toBeInTheDocument();
    expect(heroCard('Subjects to clear').queryByText(/you are clear/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Semester 1' }));
    expect(heroCard('Credits earned').getByText('4', { exact: true })).toBeInTheDocument();
    expect(heroCard('Credits earned').getByText('Semester 1 · Passed subjects only')).toBeInTheDocument();
    expect(semesterCredits().getByText('4', { exact: true })).toBeInTheDocument();
    expect(heroCard('Subjects to clear').getByText('1', { exact: true })).toBeInTheDocument();
    expect(heroCard('Subjects to clear').getByText('Semester 1 · Failed subjects to clear')).toBeInTheDocument();
    expect(heroCard('Subjects to clear').queryByText('2', { exact: true })).not.toBeInTheDocument();
  });

  it('derives legacy semester credits from passed and completed subjects only', async () => {
    mocks.profileGet.mockResolvedValue({ semester: 2 });
    const payload = history();
    const course = payload.semesters[1].courses[0];
    mocks.historyGet.mockResolvedValue({
      ...payload,
      total_credits_earned: 25,
      semesters: [{
        semester_number: 2, sgpa: 6, credits: 21,
        courses: [
          { ...course, course_id: 'passed', credits: 2, status: 'PASS' },
          { ...course, course_id: 'completed', credits: 3, status: 'COMPLETED' },
          { ...course, course_id: 'in-progress', credits: 7, status: 'IN_PROGRESS', grade: '—', grade_points: null },
          { ...course, course_id: 'failed', credits: 4, status: 'FAIL', grade: 'F', grade_points: 0 },
          { ...course, course_id: 'enrolled', credits: 5, status: 'ENROLLED', grade: '—', grade_points: null },
        ],
      }],
    });
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroCard('Credits earned').getByText('5', { exact: true })).toBeInTheDocument();
    expect(semesterCredits().getByText('5', { exact: true })).toBeInTheDocument();
    expect(heroCard('Credits earned').queryByText('25', { exact: true })).not.toBeInTheDocument();
    expect(heroCard('Credits earned').queryByText('21', { exact: true })).not.toBeInTheDocument();
  });

  it.each([0, 1.5])('prefers the semester API earned-credit value %s over a course-derived or program total', async (creditsEarned) => {
    mocks.profileGet.mockResolvedValue({ semester: 2 });
    const payload = history();
    payload.semesters[1].credits_earned = creditsEarned;
    mocks.historyGet.mockResolvedValue(payload);
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroCard('Credits earned').getByText(String(creditsEarned), { exact: true })).toBeInTheDocument();
    expect(semesterCredits().getByText(String(creditsEarned), { exact: true })).toBeInTheDocument();
    expect(heroCard('Credits earned').queryByText('6', { exact: true })).not.toBeInTheDocument();
  });

  it('shows unavailable semester totals rather than reusing program totals for a semester with no record', async () => {
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroCard('Credits earned').getByText('—', { exact: true })).toBeInTheDocument();
    expect(semesterCredits().getByText('—', { exact: true })).toBeInTheDocument();
    expect(heroCard('Subjects to clear').getByText('—', { exact: true })).toBeInTheDocument();
    expect(heroCard('Subjects to clear').getByText('Semester 3 · Awaiting results')).toBeInTheDocument();
    expect(heroCard('Subjects to clear').queryByText(/you are clear/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Semester 2' }));
    expect(heroCard('Credits earned').getByText('2', { exact: true })).toBeInTheDocument();
    expect(heroCard('Subjects to clear').getByText('0', { exact: true })).toBeInTheDocument();
    expect(heroCard('Subjects to clear').getByText('Semester 2 · No failed subjects recorded')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Semester 4' }));
    expect(heroCard('Credits earned').getByText('—', { exact: true })).toBeInTheDocument();
    expect(semesterCredits().getByText('—', { exact: true })).toBeInTheDocument();
    expect(heroCard('Subjects to clear').getByText('—', { exact: true })).toBeInTheDocument();
  });

  it('counts only uncleared subjects from the selected semester', async () => {
    mocks.profileGet.mockResolvedValue({ semester: 2 });
    const payload = history();
    const currentBacklog = { course_id: 'course-two', course_code: 'TEST-201', course_name: 'Second semester subject', semester: 2 };
    mocks.historyGet.mockResolvedValue({
      ...payload,
      backlogs: {
        uncleared: [
          currentBacklog,
          { course_id: 'course-one', course_code: 'TEST-101', course_name: 'First semester subject', semester: 1 },
        ],
        cleared: [{ ...currentBacklog, course_id: 'cleared-two' }],
      },
    });
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroCard('Subjects to clear').getByText('1', { exact: true })).toBeInTheDocument();
    expect(heroCard('Subjects to clear').queryByText('2', { exact: true })).not.toBeInTheDocument();
  });

  it('falls back to the history current semester when the profile request fails', async () => {
    mocks.profileGet.mockRejectedValue(new Error('Profile unavailable'));
    mocks.historyGet.mockResolvedValue({ ...history(), current_semester: 1 });
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroSummary().getByText('Semester 1 GPA (SGPA)')).toBeInTheDocument();
    expect(heroSummary().getByText('8.00', { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not guess a current semester when both metadata sources are unavailable', async () => {
    mocks.profileGet.mockRejectedValue(new Error('Profile unavailable'));
    mocks.historyGet.mockResolvedValue({ ...history(), current_semester: null });
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(await screen.findByText('Current semester unavailable. Select a semester below.')).toBeInTheDocument();
    expect(heroGpaSummary().getByText('—', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semester 2' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Semester 2' }));
    expect(heroSummary().getByText('6.00', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Second semester subject')).toBeInTheDocument();
  });

  it('shows results while the profile loads and preserves a manual semester selection after it arrives', async () => {
    let resolveProfile!: (value: { semester: number }) => void;
    mocks.profileGet.mockReturnValue(new Promise<{ semester: number }>((resolve) => { resolveProfile = resolve; }));
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    fireEvent.click(screen.getByRole('button', { name: 'Semester 1' }));
    expect(heroSummary().getByText('8.00', { exact: true })).toBeInTheDocument();
    await act(async () => resolveProfile({ semester: 2 }));
    expect(screen.getByRole('button', { name: 'Semester 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(heroSummary().getByText('Semester 1 GPA (SGPA)')).toBeInTheDocument();
    expect(heroSummary().getByText('8.00', { exact: true })).toBeInTheDocument();
  });

  it('keeps results usable when profile metadata times out without choosing an older graded semester', async () => {
    vi.useFakeTimers();
    mocks.profileGet.mockReturnValue(new Promise(() => {}));
    mocks.historyGet.mockResolvedValue({ ...history(), current_semester: null });
    render(<StudentMarksWorkspace />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('region', { name: 'Semester academic summary' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_001); });
    expect(screen.getByText('Current semester unavailable. Select a semester below.')).toBeInTheDocument();
    expect(heroGpaSummary().getByText('—', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semester 2' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Semester 1' }));
    expect(heroSummary().getByText('8.00', { exact: true })).toBeInTheDocument();
  });

  it.each([0, -1, 1.5, 'invalid'])('rejects an invalid profile semester %s and uses valid history metadata', async (semester) => {
    mocks.profileGet.mockResolvedValue({ semester });
    mocks.historyGet.mockResolvedValue({ ...history(), current_semester: 2 });
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroSummary().getByText('Semester 2 GPA (SGPA)')).toBeInTheDocument();
    expect(heroSummary().getByText('6.00', { exact: true })).toBeInTheDocument();
  });

  it('ignores a late current-semester response from the previous account', async () => {
    let resolveOldProfile!: (value: { semester: number }) => void;
    mocks.profileGet.mockReturnValueOnce(new Promise<{ semester: number }>((resolve) => { resolveOldProfile = resolve; }));
    const view = render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    mocks.token = 'student-b';
    mocks.profileGet.mockResolvedValue({ semester: 2 });
    view.rerender(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    expect(heroSummary().getByText('6.00', { exact: true })).toBeInTheDocument();
    await act(async () => resolveOldProfile({ semester: 1 }));
    expect(heroSummary().getByText('Semester 2 GPA (SGPA)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semester 2' })).toHaveAttribute('aria-pressed', 'true');
  });
});
