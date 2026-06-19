import { MyHelpdeskTicketDetailPage } from '@/components/self-service/MyHelpdeskTicketDetailPage';

export default function HodTicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  return <MyHelpdeskTicketDetailPage params={params} />;
}
