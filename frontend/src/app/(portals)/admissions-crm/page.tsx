import { redirect } from 'next/navigation';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';

export default function AdmissionsCrmIndexPage() {
  redirect(campusAdminRoutes.admissionsPipeline);
}
