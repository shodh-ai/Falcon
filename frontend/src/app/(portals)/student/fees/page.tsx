import { redirect } from 'next/navigation';

/** Legacy path — notifications and widgets now use /student/finance */
export default function StudentFeesRedirectPage() {
  redirect('/student/finance');
}
