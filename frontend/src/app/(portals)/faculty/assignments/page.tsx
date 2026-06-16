import { redirect } from 'next/navigation';

/** DA lives in each course workspace — keep this route as a redirect for old links. */
export default function FacultyAssignmentsPage() {
  redirect('/faculty/courses');
}
