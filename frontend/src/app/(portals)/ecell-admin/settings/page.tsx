import { redirect } from 'next/navigation';

export default function LegacyEcellAdminSettings() {
  redirect('/incubation/settings/cohort');
}
