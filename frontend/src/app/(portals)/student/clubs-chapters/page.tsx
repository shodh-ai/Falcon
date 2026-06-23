import { redirect } from 'next/navigation';

export default function StudentClubsChaptersRedirectPage() {
  redirect('/student/falcon-events?tab=clubs');
}
