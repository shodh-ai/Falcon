import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentInternalMarksPanel } from '@/components/student/StudentInternalMarksPanel';
import { StudentMarksWorkspace } from '@/components/student/StudentMarksWorkspace';
import type { AssessmentMark } from '@/lib/student-internal-marks';

const mocks = vi.hoisted(() => ({ api: { get: vi.fn() } }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'internal-test-student', user: { role: 'Student' } }) }));

function mark(key: string, label: string, marks_obtained: AssessmentMark['marks_obtained'], max_marks: AssessmentMark['max_marks']): AssessmentMark {
  return { key, label, marks_obtained, max_marks };
}

function subject(components: AssessmentMark[] = []) {
  return { course_id: 'course-programming', course_code: 'TEST-201', course_name: 'Programming', components };
}

afterEach(cleanup);

describe('student internal marks presentation', () => {
  it('shows actual quiz and assignment labels and a reconciled subtotal rather than blank fixed columns', () => {
    render(<StudentInternalMarksPanel subjects={[subject([mark('QUIZ-0', 'Quiz 1', 8, 10), mark('DA-1', 'Programming exercise', 16, 20)])]} />);
    const card = within(screen.getByRole('region', { name: 'TEST-201 internal marks' }));
    expect(card.getByText('Quiz 1', { exact: true })).toBeInTheDocument();
    expect(card.getByText('Programming exercise', { exact: true })).toBeInTheDocument();
    expect(card.getByText('Recorded internal marks', { exact: true })).toBeInTheDocument();
    expect(card.getByText('24/30', { exact: true })).toBeInTheDocument();
    expect(card.getByText('80% of recorded marks', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Weekly total', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Assign 2', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Mid 2', { exact: true })).not.toBeInTheDocument();
  });

  it('shows zero marks as a real result and not an awaiting-marks state', () => {
    render(<StudentInternalMarksPanel subjects={[subject([mark('QUIZ-0', 'Quiz 1', 0, 10)])]} />);
    const card = within(screen.getByRole('region', { name: 'TEST-201 internal marks' }));
    expect(card.getAllByText('0/10', { exact: true })).toHaveLength(2);
    expect(card.getByText('0% of recorded marks', { exact: true })).toBeInTheDocument();
    expect(card.queryByText('Awaiting marks', { exact: true })).not.toBeInTheDocument();
    expect(card.queryByText('No internal marks recorded yet', { exact: true })).not.toBeInTheDocument();
  });

  it('shows a useful empty state instead of a misleading 0/0 total or invented /10 maximum', () => {
    render(<StudentInternalMarksPanel subjects={[subject()]} />);
    const card = within(screen.getByRole('region', { name: 'TEST-201 internal marks' }));
    expect(card.getByText('No internal marks recorded yet', { exact: true })).toBeInTheDocument();
    expect(card.queryByText('0/0', { exact: true })).not.toBeInTheDocument();
    expect(card.queryByText(/\/10/)).not.toBeInTheDocument();
    expect(card.queryByText('0% of recorded marks', { exact: true })).not.toBeInTheDocument();
  });

  it('keeps pending and invalid assessments visible but out of the recorded total', () => {
    render(<StudentInternalMarksPanel subjects={[subject([
      mark('QUIZ-0', 'Recorded quiz', 8, 10),
      mark('DA-1', 'Pending assignment', null, 20),
      mark('PROJECT-2', 'Invalid project marks', 25, 20),
    ])]} />);
    const card = within(screen.getByRole('region', { name: 'TEST-201 internal marks' }));
    expect(card.getAllByText('8/10', { exact: true })).toHaveLength(2);
    expect(card.getByText('80% of recorded marks', { exact: true })).toBeInTheDocument();
    expect(card.getByText('Pending assignment', { exact: true })).toBeInTheDocument();
    expect(card.getByText('Awaiting marks', { exact: true })).toBeInTheDocument();
    expect(card.getByText('Invalid project marks', { exact: true })).toBeInTheDocument();
    expect(card.getByText('Marks unavailable', { exact: true })).toBeInTheDocument();
    expect(card.queryByText('33/50', { exact: true })).not.toBeInTheDocument();
  });

  it('makes the end-term exclusion visible while preserving the actual exam score', () => {
    render(<StudentInternalMarksPanel subjects={[subject([mark('QUIZ-0', 'Quiz 1', 8, 10), mark('END_TERM-1', 'Final examination', 60, 100)])]} />);
    const card = within(screen.getByRole('region', { name: 'TEST-201 internal marks' }));
    expect(card.getAllByText('8/10', { exact: true })).toHaveLength(2);
    expect(card.getByText('End-term marks', { exact: true })).toBeInTheDocument();
    expect(card.getByText('Not included in the internal total.', { exact: true })).toBeInTheDocument();
    expect(card.getByText('Final examination', { exact: true })).toBeInTheDocument();
    expect(card.getByText('60/100', { exact: true })).toBeInTheDocument();
    expect(card.queryByText('68/110', { exact: true })).not.toBeInTheDocument();
  });

  it('keeps subject totals separate and uses the actual unequal maxima', () => {
    render(<StudentInternalMarksPanel subjects={[
      subject([mark('QUIZ-0', 'Quiz 1', 9, 10), mark('DA-1', 'Assignment', 10, 20)]),
      { ...subject([mark('PROJECT-0', 'Project', 5, 8)]), course_id: 'course-ai', course_code: 'TEST-203', course_name: 'Responsible AI' },
    ]} />);
    const programming = within(screen.getByRole('region', { name: 'TEST-201 internal marks' }));
    const ai = within(screen.getByRole('region', { name: 'TEST-203 internal marks' }));
    expect(programming.getByText('19/30', { exact: true })).toBeInTheDocument();
    expect(programming.getByText('63.33% of recorded marks', { exact: true })).toBeInTheDocument();
    expect(ai.getAllByText('5/8', { exact: true })).toHaveLength(2);
    expect(ai.getByText('62.5% of recorded marks', { exact: true })).toBeInTheDocument();
  });
});

describe('internal marks results workspace integration', () => {
  beforeEach(() => {
    mocks.api.get.mockReset().mockImplementation((path: string) => {
      if (path === '/api/student/profile') return Promise.resolve({ semester: 2 });
      if (path === '/api/academics/marks/history') return Promise.resolve({
        cgpa: null, total_credits_earned: 0, current_semester: 2,
        semesters: [{ semester_number: 1, sgpa: null, credits: 0, courses: [] }, { semester_number: 2, sgpa: null, credits: 0, courses: [] }],
        component_marks_by_semester: [
          { semester_number: 1, subjects: [{ ...subject([mark('QUIZ-0', 'Past semester quiz', 4, 5)]), course_id: 'old-course', course_code: 'TEST-101' }] },
          { semester_number: 2, subjects: [{ ...subject([mark('QUIZ-0', 'Current quiz', 8, 10), mark('DA-1', 'Current assignment', 16, 20)]), total_internal_obtained: 999, total_internal_max: 999 }] },
        ],
        exam_reports: [], grade_cards: [], backlogs: { uncleared: [], cleared: [] },
      });
      return Promise.reject(new Error(`Unexpected test request: ${path}`));
    });
  });

  it('uses returned components rather than stale totals and scopes the panel to the selected semester', async () => {
    render(<StudentMarksWorkspace />);
    await screen.findByRole('region', { name: 'Semester academic summary' });
    fireEvent.click(screen.getByRole('button', { name: 'Internal marks' }));
    expect(screen.getByText('Current quiz', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Current assignment', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('24/30', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('999/999', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Past semester quiz', { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Semester 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Internal marks' }));
    expect(screen.getByText('Past semester quiz', { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText('4/5', { exact: true })).toHaveLength(2);
    expect(screen.queryByText('Current quiz', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('24/30', { exact: true })).not.toBeInTheDocument();
  });
});
