import { redirect } from 'next/navigation';

export default function DefaultersRedirect() {
  redirect('/finance/dashboard');
}
