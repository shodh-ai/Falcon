import { Badge } from '@/components/ui/badge';

const tones: Record<string, string> = {
  APPROVED: 'bg-emerald-100 text-emerald-800',
  PENDING_DOFA: 'bg-violet-100 text-violet-800',
  VENDOR_REVIEW: 'bg-blue-100 text-blue-800',
  BUDGET_RESERVED: 'bg-cyan-100 text-cyan-800',
  BUDGET_BLOCKED: 'bg-red-100 text-red-800',
  REJECTED: 'bg-red-100 text-red-800',
  DRAFT: 'bg-slate-100 text-slate-700',
  VALIDATED: 'bg-amber-100 text-amber-800',
};

export function AcquisitionStatus({ status }: { status: string }) {
  return <Badge className={tones[status] ?? 'bg-slate-100 text-slate-700'}>{status.replaceAll('_', ' ')}</Badge>;
}
