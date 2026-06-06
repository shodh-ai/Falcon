import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function HrSectionCard({
  title,
  description,
  children,
  actions,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm', className)}>
      {(title || description || actions) && (
        <div className="flex flex-col gap-2 border-b border-gray-100 bg-gradient-to-r from-slate-50/80 to-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title ? <h2 className="text-base font-bold text-sgvu-navy">{title}</h2> : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
