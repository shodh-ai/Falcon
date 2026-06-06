import Link from 'next/link';
import { cn } from '@/lib/utils';

const AVATAR_PALETTES = [
  'bg-sgvu-navy/10 text-sgvu-navy',
  'bg-sgvu-gold/20 text-amber-900',
  'bg-emerald-50 text-emerald-800',
  'bg-sky-50 text-sky-800',
  'bg-violet-50 text-violet-800',
  'bg-rose-50 text-rose-800',
];

export function hrInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
  }
  return (name.slice(0, 2) || '??').toUpperCase();
}

function paletteIndex(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i) * (i + 1)) % AVATAR_PALETTES.length;
  return hash;
}

export function HrAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClass =
    size === 'sm' ? 'h-8 w-8 text-[10px]' : size === 'lg' ? 'h-12 w-12 text-sm' : 'h-10 w-10 text-xs';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ring-white',
        sizeClass,
        AVATAR_PALETTES[paletteIndex(name)],
        className,
      )}
      aria-hidden
    >
      {hrInitials(name)}
    </span>
  );
}

export function HrPersonCell({
  name,
  subtitle,
  href,
}: {
  name: string;
  subtitle?: string | null;
  href?: string;
}) {
  const content = (
    <div className="flex items-center gap-3">
      <HrAvatar name={name} />
      <div className="min-w-0">
        <p className="truncate font-semibold text-gray-900">{name}</p>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition-colors hover:text-sgvu-navy">
        {content}
      </Link>
    );
  }

  return content;
}
