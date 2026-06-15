import { redirect } from 'next/navigation';

export default function ExtracurricularsRedirectPage() {
  redirect('/student/falcon-events?tab=points');
}
