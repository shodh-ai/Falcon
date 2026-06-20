import { redirect } from 'next/navigation';

export default function LegacyEcellAdminHome() {
  redirect('/incubation/dashboard');
}
