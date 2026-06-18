import { redirect } from 'next/navigation';

export default function DeanDocumentsPage() {
  redirect('/dean/profile?tab=documents');
}
