'use client';

import { use } from 'react';
import { usePathname } from 'next/navigation';
import { myHelpdeskTicketsBasePath } from '@/lib/helpdesk-routes';
import { MyHelpdeskTicketDetail } from '@/components/self-service/MyHelpdeskTicketDetail';

export function MyHelpdeskTicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = use(params);
  const pathname = usePathname();
  const backHref = myHelpdeskTicketsBasePath(pathname);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <MyHelpdeskTicketDetail ticketId={ticketId} backHref={backHref} />
    </div>
  );
}
