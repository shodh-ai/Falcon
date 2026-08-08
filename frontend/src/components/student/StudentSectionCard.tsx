import type { ComponentType, ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StudentSectionCard({
  title,
  description,
  icon: Icon,
  children,
  className,
  headerClassName,
  contentClassName,
  tone = 'default',
  action,
}: {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'gold';
  action?: ReactNode;
}) {
  const toneStyles = {
    default: 'border-sgvu-navy/10 bg-white shadow-sm',
    success: 'border-sgvu-navy/10 bg-white shadow-sm',
    warning: 'border-sgvu-navy/10 bg-white shadow-sm',
    danger: 'border-sgvu-navy/10 bg-white shadow-sm',
    gold: 'border-sgvu-navy/10 bg-white shadow-sm',
  };

  const iconTone = {
    default: 'bg-sgvu-gold/20 text-sgvu-navy',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-destructive/10 text-destructive',
    gold: 'bg-sgvu-gold/30 text-sgvu-navy',
  };

  return (
    <Card className={cn('min-w-0 overflow-hidden', toneStyles[tone], className)}>
      <CardHeader className={cn('space-y-0 p-4 pb-3 sm:p-6 sm:pb-4', headerClassName)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-11 sm:w-11', iconTone[tone])}>
                <Icon className="h-5 w-5" />
              </div>
            ) : null}
            <div className="min-w-0">
              <CardTitle className="text-sm sm:text-base">{title}</CardTitle>
              {description ? <CardDescription className="mt-1 text-xs sm:text-sm">{description}</CardDescription> : null}
            </div>
          </div>
          {action ? (
            <div className="w-full shrink-0 sm:w-auto [&_button]:w-full sm:[&_button]:w-auto">
              {action}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className={cn('p-4 pt-0 sm:p-6 sm:pt-0', contentClassName)}>{children}</CardContent>
    </Card>
  );
}
