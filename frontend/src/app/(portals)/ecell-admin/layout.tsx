import { redirect } from 'next/navigation';

export default function LegacyEcellAdminLayout({ children }: { children: React.ReactNode }) {
  redirect('/incubation/dashboard');
}
