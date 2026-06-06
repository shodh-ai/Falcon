import type { ReactNode } from 'react';

export function HrPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="absolute left-0 top-0 h-full w-1 bg-sgvu-gold" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="pl-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Falcon HRMS</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-sgvu-navy">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 pl-2">{actions}</div> : null}
      </div>
    </div>
  );
}
