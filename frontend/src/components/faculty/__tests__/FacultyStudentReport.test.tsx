import type { ReactNode } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FacultyStudentReport, type FacultyStudentReportData } from '../FacultyStudentReport';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <>{children}</>,
  LineChart: ({ data, children }: { data: unknown; children: ReactNode }) => <div data-testid="gpa-chart" data-points={JSON.stringify(data)}>{children}</div>,
  Line: ({ dataKey, connectNulls }: { dataKey: string; connectNulls: boolean }) => <span data-testid={`line-${dataKey}`} data-connect-nulls={String(connectNulls)} />,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

function reportFixture(): FacultyStudentReportData {
  return {
    student: { student_user_id: 'student-1', name: 'Unrecorded Student', official_email: 'student@example.test', roll_number: 'A001', batch: '2026', department: 'Engineering' },
    subject: { course_id: 'course-1', course_code: 'CS101', course_name: 'Algorithms' },
    summary: {
      internal_avg_percent: null,
      published_assessment_count: 0,
      attendance_percent: null,
      attendance_record_count: 0,
      class_average_percent: null,
      class_rank: null,
      class_size: 4,
      graded_student_count: 2,
      cumulative_demerit_points: 0,
      course_demerit_points: 0,
      is_subject_back_triggered: false,
      assignments_submitted: 0,
      assignments_total: 0,
      assignments_graded: 0,
      pending_assignments: 0,
      assignment_completion_percent: 0,
      graded_assignment_avg_percent: null,
    },
    academic: null,
    marks: [],
    assignments: [],
    demerits: [],
    risk_flags: [],
    gpa_history: [],
  };
}

function metric(label: string) {
  return screen.getByText(label, { exact: true, selector: 'span' }).parentElement!;
}

afterEach(cleanup);

describe('student report missing measures', () => {
  it('distinguishes the academic-record CGPA from a later withheld grade card without replacing values', () => {
    const report = reportFixture();
    report.academic = {
      academic_year: '2026-27', semester: 3, sgpa: 8.4, cgpa: 8.25,
      backlog_count: 0, progression_status: 'PROMOTED', remarks: null,
    };
    report.gpa_history = [{ semester: 4, sgpa: 7.2, cgpa: 7.2, status: 'WITHHELD', academic_year: null, source: 'grade_card' }];
    render(<FacultyStudentReport report={report} />);

    expect(metric('CGPA')).toHaveTextContent('8.25');
    expect(screen.getByText('CGPA source: Academic record · Sem 3 · 2026-27')).toBeInTheDocument();
    expect(screen.getByText('History source: Grade card.')).toBeInTheDocument();
    expect(screen.getByText('Withheld grade-card values are shown for review and are not published results.')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Sem 4 7.20 7.20 WITHHELD' })).toBeInTheDocument();
    expect(report.academic.cgpa).toBe(8.25);
    expect(report.gpa_history[0].cgpa).toBe(7.2);
  });

  it('identifies a grade-card fallback and does not invent an academic year', () => {
    const report = reportFixture();
    report.gpa_history = [{ semester: 4, sgpa: 0, cgpa: 0, status: 'PUBLISHED', academic_year: null, source: 'grade_card' }];
    render(<FacultyStudentReport report={report} />);

    expect(metric('CGPA')).toHaveTextContent('0');
    expect(screen.getByText('CGPA source: Grade card · Sem 4')).toBeInTheDocument();
    expect(screen.queryByText(/Withheld grade-card values/)).not.toBeInTheDocument();
  });

  it('shows incomplete measures without a fabricated score, rank, or on-track status', () => {
    render(<FacultyStudentReport report={reportFixture()} />);

    expect(metric('Published marks')).toHaveTextContent('Not graded');
    expect(metric('Attendance')).toHaveTextContent('Not recorded');
    expect(metric('Rank among graded students')).toHaveTextContent('N/A');
    expect(metric('Rank among graded students')).not.toHaveTextContent('null/4');
    expect(screen.getByText('Assessment incomplete')).toBeInTheDocument();
    expect(screen.queryByText('On track')).not.toBeInTheDocument();
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
    expect(screen.getByText(/No overall assessment is available/)).toBeInTheDocument();
  });

  it('treats zero-count cached measures as missing rather than measured zero', () => {
    const report = reportFixture();
    report.summary.internal_avg_percent = 0;
    report.summary.attendance_percent = 24;
    report.summary.class_rank = 1;
    render(<FacultyStudentReport report={report} />);

    expect(metric('Published marks')).toHaveTextContent('Not graded');
    expect(metric('Attendance')).toHaveTextContent('Not recorded');
    expect(metric('Rank among graded students')).toHaveTextContent('N/A');
    expect(metric('Published marks')).not.toHaveTextContent('0%');
    expect(metric('Attendance')).not.toHaveTextContent('24%');
    expect(screen.queryByText('On track')).not.toBeInTheDocument();
  });

  it('does not plot an all-missing GPA series as zeros', () => {
    const report = reportFixture();
    report.gpa_history = [{ semester: 1, sgpa: null, cgpa: null, status: 'PENDING', academic_year: '2026-27', source: 'academic' }];
    render(<FacultyStudentReport report={report} />);

    expect(screen.getByText('No recorded SGPA or CGPA values are available for this student yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('gpa-chart')).not.toBeInTheDocument();
    expect(metric('CGPA')).toHaveTextContent('N/A');
    const semester = screen.getByRole('row', { name: 'Sem 1 N/A N/A PENDING' });
    expect(within(semester).getAllByRole('cell', { name: 'N/A' })).toHaveLength(2);
  });

  it('retains genuine measured zero scores and GPA while leaving missing chart points empty', () => {
    const report = reportFixture();
    report.summary = { ...report.summary, internal_avg_percent: 0, published_assessment_count: 1, attendance_percent: 0, attendance_record_count: 1, class_rank: 1 };
    report.risk_flags = [{ label: 'Low published marks', severity: 'HIGH', detail: 'Published marks are 0%.' }];
    report.gpa_history = [
      { semester: 1, sgpa: null, cgpa: null, status: 'PENDING', academic_year: '2026-27', source: 'academic' },
      { semester: 2, sgpa: 0, cgpa: 0, status: 'FAIL', academic_year: '2026-27', source: 'academic' },
    ];
    render(<FacultyStudentReport report={report} />);

    expect(metric('Published marks')).toHaveTextContent('0%');
    expect(metric('Attendance')).toHaveTextContent('0%');
    expect(metric('Rank among graded students')).toHaveTextContent('1/2');
    expect(metric('CGPA')).toHaveTextContent('0');
    expect(metric('CGPA')).not.toHaveTextContent('N/A');
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.queryByText('Not graded')).not.toBeInTheDocument();
    const data = JSON.parse(screen.getByTestId('gpa-chart').getAttribute('data-points')!);
    expect(data).toEqual([
      { semester: 1, label: 'Sem 1', sgpa: null, cgpa: null },
      { semester: 2, label: 'Sem 2', sgpa: 0, cgpa: 0 },
    ]);
    expect(screen.getByTestId('line-sgpa')).toHaveAttribute('data-connect-nulls', 'false');
    expect(screen.getByTestId('line-cgpa')).toHaveAttribute('data-connect-nulls', 'false');
  });

  it('keeps legitimate assignment concerns even when marks and attendance are missing', () => {
    const report = reportFixture();
    report.risk_flags = [{ label: 'Pending assignments', severity: 'MEDIUM', detail: 'A submitted assignment is still required.' }];
    render(<FacultyStudentReport report={report} />);

    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Pending assignments')).toBeInTheDocument();
    expect(metric('Published marks')).toHaveTextContent('Not graded');
    expect(metric('Attendance')).toHaveTextContent('Not recorded');
    expect(screen.queryByText('On track')).not.toBeInTheDocument();
  });
});
