import { FacultyPageShell } from '@/components/faculty';
import { MyHelpdeskTicketDetailPage } from '@/components/self-service/MyHelpdeskTicketDetailPage';

export default function FacultyTicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  return (
    <FacultyPageShell>
      <MyHelpdeskTicketDetailPage params={params} />
    </FacultyPageShell>
  );
}
