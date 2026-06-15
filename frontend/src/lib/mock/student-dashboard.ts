export interface TimetableSlot {
  id: string;
  courseId: string;
  subject: string;
  room: string;
  start: string;
  end: string;
  /** Computed client-side in IST; API value is ignored by TimetableWidget. */
  status: 'upcoming' | 'ongoing' | 'done';
  liveJoinUrl?: string | null;
  isVirtual?: boolean;
}

export const mockTimetableToday: TimetableSlot[] = [
  { id: '1', courseId: '1', subject: 'Data Structures', room: 'Lab 204', start: '09:00', end: '10:00', status: 'done' },
  { id: '2', courseId: '2', subject: 'Operating Systems', room: 'Room 112', start: '10:15', end: '11:15', status: 'ongoing' },
  { id: '3', courseId: '3', subject: 'DBMS', room: 'Room 305', start: '11:30', end: '12:30', status: 'upcoming' },
  { id: '4', courseId: '4', subject: 'Soft Skills', room: 'Auditorium', start: '14:00', end: '15:00', status: 'upcoming' },
];

export const mockAttendance = {
  percentage: 72,
  present: 86,
  total: 119,
  minimumRequired: 75,
};

export const mockFeeDues = {
  totalPending: 24500,
  dueDate: '2026-06-15',
  items: [
    { id: '1', label: 'Semester 4 Tuition', amount: 18000 },
    { id: '2', label: 'Exam Fee', amount: 3500 },
    { id: '3', label: 'Hostel Mess', amount: 3000 },
  ],
};

export const mockNotifications = [
  { id: '1', title: 'Fee due in 23 days', body: '₹24,500 pending for Semester 4', type: 'fee' as const, unread: true },
  { id: '2', title: 'Attendance below 75%', body: 'You are at 72%. Attend upcoming classes.', type: 'warning' as const, unread: true },
  { id: '3', title: 'Gate pass approved', body: 'Valid today 4:00 PM – 8:00 PM', type: 'success' as const, unread: false },
];
