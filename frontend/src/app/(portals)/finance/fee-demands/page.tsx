import { redirect } from 'next/navigation';

export default function FeeDemandsRedirect() {
  redirect('/finance/fee-structures');
}
