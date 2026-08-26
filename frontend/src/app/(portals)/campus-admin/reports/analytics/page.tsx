import { redirect } from 'next/navigation';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';

export default function CampusAdminReportsAnalyticsRedirectPage() {
  redirect(campusAdminRoutes.analytics);
}
