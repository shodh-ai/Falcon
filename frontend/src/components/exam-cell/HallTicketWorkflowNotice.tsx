export type HallTicketWorkflowAvailability = {
  status: 'BLOCKED';
  code: 'HALL_TICKET_POLICY_UNCONFIRMED';
  message: string;
  can_sync: boolean;
  can_approve: boolean;
  can_issue: boolean;
};

export function HallTicketWorkflowNotice({ workflow }: { workflow?: HallTicketWorkflowAvailability }) {
  return (
    <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">Hall-ticket approval and issuance unavailable</p>
      <p className="mt-1">{workflow?.message ?? 'The verified approval and issuance workflow is unavailable. Existing records are read-only; eligibility alone does not authorize a hall ticket. Contact the Exam Cell administrator.'}</p>
    </div>
  );
}
