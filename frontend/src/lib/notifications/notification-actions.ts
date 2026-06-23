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
    router.push(path);
    return 'navigate';
  }

  return 'none';
}
