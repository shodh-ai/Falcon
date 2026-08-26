import { redirect } from 'next/navigation';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';

export default function CampusAdminCommunicationAnnouncementsRedirectPage() {
  redirect(campusAdminRoutes.operationsAnnouncements);
}
