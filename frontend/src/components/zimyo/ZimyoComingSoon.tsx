'use client';

import { Construction } from 'lucide-react';

type Props = {
  title: string;
  description?: string;
};

export function ZimyoComingSoon({ title, description }: Props) {
  return (
    <div className="py-16 flex flex-col items-center justify-center gap-4 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60">
      <div className="h-14 w-14 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-sgvu-navy">
        <Construction className="h-7 w-7" />
      </div>
      <div className="space-y-1 max-w-md px-4">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-500 font-medium leading-relaxed">
          {description ?? 'This Zimyo module is on our roadmap and will be connected to live HRMS data in a future release.'}
        </p>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1 rounded-full">
        Coming Soon
      </span>
    </div>
  );
}
