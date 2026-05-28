'use client';

import { Button } from '@/components/ui/button';

export interface FeePaymentCardProps {
  feeHead: string;
  academicYear: string;
  amountDue: number;
  dueDate: string;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'WAIVED';
  onPay?: () => void;
}

const statusStyles: Record<FeePaymentCardProps['status'], string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  PARTIALLY_PAID: 'bg-blue-50 text-blue-700',
  PAID: 'bg-green-50 text-green-700',
  OVERDUE: 'bg-red-50 text-red-700',
  WAIVED: 'bg-slate-100 text-slate-600',
};

export function FeePaymentCard({ feeHead, academicYear, amountDue, dueDate, status, onPay }: FeePaymentCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500">{academicYear}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#08234a]">{feeHead}</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[status]}`}>{status}</span>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-2xl font-black text-[#08234a]">₹{amountDue.toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-500">Due {new Date(dueDate).toLocaleDateString('en-IN')}</p>
        </div>
        {status !== 'PAID' && status !== 'WAIVED' && (
          <Button onClick={onPay} variant="secondary" size="sm">
            Pay Now
          </Button>
        )}
      </div>
    </article>
  );
}
