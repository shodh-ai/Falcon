import { downloadExportJob, parseExportJobId } from '@/lib/api/api.hr-documents';
import { isLaunchModuleEnabled } from '@/lib/launch-modules';

export type NotificationActionRouter = {
  push: (path: string) => void;
};

/**
 * Handle a notification click: export jobs download immediately; everything else routes.
 */
export async function handleNotificationAction(
  token: string | null,
  actionLink: string | null | undefined,
  router: NotificationActionRouter,
): Promise<'download' | 'navigate' | 'none'> {
  if (!token) {
    throw new Error('You must be signed in to open this notification.');
  }

  const exportJobId = parseExportJobId(actionLink);
  if (exportJobId) {
    await downloadExportJob(token, exportJobId);
    return 'download';
  }

  if (actionLink) {
    let path = actionLink.startsWith('/') ? actionLink : `/${actionLink}`;
    const legacyHelpdesk = path.match(/^\/student\/helpdesk\/([^/?#]+)$/);
    if (legacyHelpdesk) {
      path = `/student/helpdesk?ticket=${encodeURIComponent(legacyHelpdesk[1])}`;
    }
    if (path === '/student/fees') {
      path = isLaunchModuleEnabled('finance') ? '/student/finance' : '/student/dashboard';
    }
    if (path === '/student/library' && !isLaunchModuleEnabled('library')) {
      path = '/student/dashboard';
    }
    if (path === '/student/admission-vault' && !isLaunchModuleEnabled('admissionVault')) {
      path = '/student/profile';
    }
    if (path === '/student/gate-pass' || path === '/student/hostel') {
      path = '/student/campus-life';
    }
    if (path.startsWith('/student/club-management')) {
      path = '/student/falcon-events';
    }
    if (path === '/student/grades') {
      path = '/student/marks';
    }
    router.push(path);
    return 'navigate';
  }

  return 'none';
}
