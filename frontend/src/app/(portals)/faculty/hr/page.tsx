import { redirect } from 'next/navigation';

/** Historical faculty HR URL. All self-service now lives in one canonical flow. */
export default function FacultyHrHubRedirectPage() {
  redirect('/faculty/me/workforce?view=leave');
}
