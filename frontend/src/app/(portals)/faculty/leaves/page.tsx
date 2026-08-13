import { redirect } from 'next/navigation';

/** Leave Management lives in Work Calendar (ESS workforce hub). */
export default function FacultyLeavesRedirectPage() {
  redirect('/faculty/me/workforce');
}
