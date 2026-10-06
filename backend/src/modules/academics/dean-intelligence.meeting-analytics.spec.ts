import { summarizeDeanMeetingAnalytics } from './dean-intelligence.service';

describe('summarizeDeanMeetingAnalytics', () => {
  it('summarizes a single-department meeting once', () => {
    expect(
      summarizeDeanMeetingAnalytics(
        [{ status: 'PENDING', has_mom: false, participant_count: '2' }],
        [{ dept_name: 'Engineering', participant_count: '2' }],
      ),
    ).toEqual({
      meetings_scheduled: 1,
      meetings_completed: 0,
      meetings_cancelled: 0,
      pending_mom: 1,
      average_attendance: 2,
      department_participation: [{ department: 'Engineering', count: 2 }],
    });
  });

  it('counts a multi-department meeting once in overall KPIs', () => {
    expect(
      summarizeDeanMeetingAnalytics(
        [{ status: 'COMPLETED', has_mom: true, participant_count: '3' }],
        [
          { dept_name: 'Engineering', participant_count: '2' },
          { dept_name: 'Sciences', participant_count: '1' },
        ],
      ),
    ).toMatchObject({
      meetings_scheduled: 0,
      meetings_completed: 1,
      meetings_cancelled: 0,
      pending_mom: 0,
      average_attendance: 3,
      department_participation: [
        { department: 'Engineering', count: 2 },
        { department: 'Sciences', count: 1 },
      ],
    });
  });

  it('counts a meeting with no participants once and keeps participation at zero', () => {
    expect(
      summarizeDeanMeetingAnalytics(
        [{ status: 'CANCELLED', has_mom: false, participant_count: '0' }],
        [{ dept_name: null, participant_count: '0' }],
      ),
    ).toMatchObject({
      meetings_scheduled: 0,
      meetings_completed: 0,
      meetings_cancelled: 1,
      pending_mom: 1,
      average_attendance: 0,
      department_participation: [{ department: 'School-wide', count: 0 }],
    });
  });

  it('averages multiple participants from multiple meetings by meeting', () => {
    expect(
      summarizeDeanMeetingAnalytics(
        [
          { status: 'CONFIRMED', has_mom: false, participant_count: '4' },
          { status: 'COMPLETED', has_mom: true, participant_count: '2' },
        ],
        [
          { dept_name: 'Engineering', participant_count: '4' },
          { dept_name: 'Engineering', participant_count: '2' },
        ],
      ),
    ).toMatchObject({
      meetings_scheduled: 1,
      meetings_completed: 1,
      meetings_cancelled: 0,
      pending_mom: 1,
      average_attendance: 3,
      department_participation: [{ department: 'Engineering', count: 6 }],
    });
  });
});
