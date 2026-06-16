import { redirect } from 'next/navigation';

export default function FacultyDocumentsPage() {
  redirect('/faculty/profile?tab=documents');
}
