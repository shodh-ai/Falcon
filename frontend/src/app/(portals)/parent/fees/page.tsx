import { redirect } from 'next/navigation';
import { isLaunchModuleEnabled } from '@/lib/launch-modules';

export default function ParentFeesRedirect() {
  redirect(isLaunchModuleEnabled('finance') ? '/parent/finance' : '/parent/dashboard');
}
