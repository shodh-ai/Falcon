import { redirect } from 'next/navigation';

/** Legacy route — dining workspace moved to /student/dining */
export default function StudentMessRedirect() {
  redirect('/student/dining');
}
