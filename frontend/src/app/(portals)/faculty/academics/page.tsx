import { redirect } from 'next/navigation';

/** Legacy combined workspace — routes split per VTOP-style faculty portal. */
export default function FacultyAcademicsRedirectPage() {
  redirect('/faculty/attendance');
}
