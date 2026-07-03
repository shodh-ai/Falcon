import { redirect } from 'next/navigation';

export default function HodLeaveApprovalsRedirectPage() {
  redirect('/hod/inbox?scope=dept');
}
