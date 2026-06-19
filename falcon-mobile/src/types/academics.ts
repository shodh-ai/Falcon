export type TimetableSlot = {
  timetable_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  credits: number;
  room: string;
  faculty_name: string | null;
  start_time: string;
  end_time: string;
  status: 'upcoming' | 'ongoing' | 'done';
  is_virtual: boolean;
  live_join_url: string | null;
};

export type EnrollmentCourse = {
  course_id: string;
  course_code: string;
  course_name: string;
  credits: number;
  is_elective: boolean;
};

export type EnrollmentDto = {
  enrollment_id: string;
  semester: number;
  status: string;
  grade: string | null;
  grade_points: number | null;
  attendance_percent: number;
  course: EnrollmentCourse;
};

export type DashboardMetrics = {
  cgpa: number;
  credits_completed: number;
  credits_required: number;
  attendance_percent: number;
  completed_courses: EnrollmentDto[];
  enrolled_courses: EnrollmentDto[];
};

export type SubjectAttendance = {
  course_code: string;
  course_name: string;
  semester: number;
  attendance_percent: string;
  status: string;
};

export type AttendanceSummary = {
  overall_percent: number;
  subject_wise: SubjectAttendance[];
  progression: {
    semester: number;
    status: 'COMPLETED' | 'IN_PROGRESS' | 'PARTIAL' | 'UPCOMING';
    courses_count: number;
  }[];
};

export type MarkComponent = {
  key: string;
  label: string;
  marks_obtained: number;
  max_marks: number;
};

export type SubjectMarks = {
  course_id: string;
  course_code: string;
  course_name: string;
  components: MarkComponent[];
  total_internal_obtained: number;
  total_internal_max: number;
};

export type MarksHistory = {
  cgpa: number;
  total_credits_earned: number;
  semesters: {
    semester_number: number;
    sgpa: number;
    credits: number;
    courses: {
      course_id: string;
      course_code: string;
      course_name: string;
      course_type: 'Lab' | 'Project' | 'Theory';
      credits: number;
      grade: string;
      status: 'PASS' | 'FAIL' | 'IN_PROGRESS';
    }[];
  }[];
  component_marks_by_semester: {
    semester_number: number;
    subjects: SubjectMarks[];
  }[];
  backlogs: {
    uncleared: { course_id: string; course_code: string; course_name: string; semester: number }[];
    cleared: { course_code: string; course_name: string; semester: number }[];
  };
};

export type BunkMeter = {
  conducted: number;
  attended: number;
  percent: number;
  margin: number;
  marginMessage: string;
};
