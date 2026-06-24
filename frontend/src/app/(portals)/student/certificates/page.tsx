import { redirect } from 'next/navigation';

export default function StudentCertificatesRedirectPage() {
  redirect('/student/exit?tab=degree');
}
