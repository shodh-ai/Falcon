import Image from 'next/image';
import { cn } from '@/lib/utils';

const LOGO_PATH = '/logo.png';
const LOGO_ASPECT = 2.75;

type FalconLogoProps = {
  className?: string;
  size?: number;
  variant?: 'mark' | 'full';
  /** Square crop of the falcon mark for narrow spaces (collapsed sidebar). */
  compact?: boolean;
};

export function FalconLogo({
  className,
  size = 48,
  variant = 'mark',
  compact = false,
}: FalconLogoProps) {
  const height = size;
  const width = Math.round(size * LOGO_ASPECT);

  const image = (
    <Image
      src={LOGO_PATH}
      alt="Falcon"
      width={width}
      height={height}
      priority={variant === 'full'}
      className={cn(
        'object-contain drop-shadow-[0_2px_12px_rgba(214,182,93,0.35)]',
        compact
          ? 'h-full w-full scale-[2.15] object-cover object-[center_18%]'
          : 'h-auto w-full max-w-full',
        variant === 'mark' && className,
      )}
      style={compact ? undefined : { height: size, width: 'auto', maxWidth: '100%' }}
    />
  );

  if (variant === 'full') {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        {image}
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sgvu-gold/90">
          Campus OS
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className={cn('inline-flex shrink-0 overflow-hidden', className)}
        style={{ width: size, height: size }}
      >
        {image}
      </div>
    );
  }

  return <div className={cn('inline-flex shrink-0 justify-center', className)}>{image}</div>;
}
