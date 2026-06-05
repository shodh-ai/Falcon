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
    default: 'border-border/80 bg-card shadow-sm',
    success: 'border-emerald-200/70 bg-emerald-50/40 shadow-sm shadow-emerald-100/40',
    warning: 'border-amber-200/70 bg-amber-50/40 shadow-sm shadow-amber-100/40',
    danger: 'border-destructive/30 bg-destructive/5 shadow-sm',
    gold: 'border-sgvu-gold/30 bg-gradient-to-b from-sgvu-gold/10 to-white shadow-sm',
  };

  const iconTone = {
    default: 'bg-sgvu-gold/20 text-sgvu-navy',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-destructive/10 text-destructive',
    gold: 'bg-sgvu-gold/30 text-sgvu-navy',
  };

  return (
    <Card className={cn('overflow-hidden', toneStyles[tone], className)}>
      <CardHeader className={cn('pb-4', headerClassName)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {Icon ? (
              <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', iconTone[tone])}>
                <Icon className="h-5 w-5" />
              </div>
            ) : null}
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
            </div>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}
