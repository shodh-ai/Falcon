import { redirect } from 'next/navigation';

/** Merged into unified HR Access Control at /hr/admin/permissions */
export default function HrDelegationRedirectPage() {
  redirect('/hr/admin/permissions');
}
