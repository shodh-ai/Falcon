import { redirect } from 'next/navigation';

/** Legacy URL — Tatkal booking lives at /student/hostel-booking */
export default function HostelTatkalRedirectPage() {
  redirect('/student/hostel-booking');
}
