import { redirect } from 'next/navigation';

/** Certificate requests live under Graduation (degree/convocation). */
export default function ProfileCertificatesRedirectPage() {
  redirect('/student/exit?tab=degree');
}
