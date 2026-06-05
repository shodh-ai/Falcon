import { redirect } from 'next/navigation';

/** Legacy notification links used /student/helpdesk/:ticketId — redirect to the list page. */
export default async function LegacyHelpdeskTicketRedirect({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  redirect(`/student/helpdesk?ticket=${encodeURIComponent(ticketId)}`);
}
