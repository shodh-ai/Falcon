import { redirect } from 'next/navigation';
import { isLaunchModuleEnabled } from '@/lib/launch-modules';

/** Legacy path — notifications and widgets now use /student/finance */
export default function StudentFeesRedirectPage() {
  redirect(isLaunchModuleEnabled('finance') ? '/student/finance' : '/student/dashboard');
}
