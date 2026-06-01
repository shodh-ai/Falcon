import { cn } from '@/lib/utils';

type FalconLogoProps = {
  className?: string;
  size?: number;
  variant?: 'mark' | 'full';
};

export function FalconLogo({ className, size = 40, variant = 'mark' }: FalconLogoProps) {
  if (variant === 'full') {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <FalconLogo size={size} />
        <div className="leading-tight">
          <p className="text-lg font-black tracking-tight text-white">Falcon</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sgvu-gold/90">
            Campus OS
          </p>
        </div>
      </div>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <rect width="64" height="64" rx="14" fill="#08234a" />
      <path
        d="M32 12c-8 6-14 14-14 22 0 8 6 14 14 18 8-4 14-10 14-18 0-8-6-16-14-22z"
        fill="#d6b65d"
      />
      <path
        d="M32 20c-4 3-7 8-7 13 0 5 3 9 7 11 4-2 7-6 7-11 0-5-3-10-7-13z"
        fill="#08234a"
      />
      <path
        d="M18 28c4-2 9-3 14-3s10 1 14 3"
        stroke="#d6b65d"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}
