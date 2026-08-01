import { redirect } from 'next/navigation';
import { ADMISSIONS_CRM_DASHBOARD_HREF } from '@/components/admissions-crm/admissions-crm-constants';

export default function AdminAdmissionsPage() {
  redirect(ADMISSIONS_CRM_DASHBOARD_HREF);
}
