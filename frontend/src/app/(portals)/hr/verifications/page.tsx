import { redirect } from 'next/navigation';

export default function LegacyHrVerificationRedirect() {
  redirect('/hr/dashboard');
}
