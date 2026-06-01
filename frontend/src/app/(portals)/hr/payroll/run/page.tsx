import { redirect } from 'next/navigation';

export default function HrPayrollRunRedirect() {
  redirect('/hr/payroll/processing');
}
