import { redirect } from 'next/navigation';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';

export default function CampusAdminCommunicationHelpdeskRedirectPage() {
  redirect(campusAdminRoutes.operationsRequests);
}
