import { redirect } from 'next/navigation';

export default function HodDocumentsPage() {
  redirect('/hod/profile?tab=documents');
}
