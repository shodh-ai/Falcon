'use client';

import { cn } from '@/lib/utils';

function healthTone(score: number): { stroke: string; text: string; label: string } {
  if (score >= 90) {
    return { stroke: '#059669', text: 'text-emerald-700', label: 'Excellent' };
  }
  if (score >= 70) {
    return { stroke: '#d97706', text: 'text-amber-700', label: 'Stable' };
  }
  return { stroke: '#dc2626', text: 'text-red-600', label: 'Attention' };
}

export function RegistrarHealthGauge({
  score,
  size = 72,
  className,
}: {
  score: number;
  size?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tone = healthTone(clamped);
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 72 72" className="-rotate-90" aria-hidden>
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          className="text-slate-100"
        />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke={tone.stroke}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-mono text-sm font-black tabular-nums', tone.text)}>
          {clamped}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {tone.label}
        </span>
      </div>
    </div>
  );
}
