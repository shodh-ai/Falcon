import { redirect } from 'next/navigation';

export default function LegacyVerificationsRedirect() {
  redirect('/alumni-admin/verification');
}
