import { Pressable, Text, ActivityIndicator, type PressableProps } from 'react-native';

interface ButtonProps extends PressableProps {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}

export function Button({
  label,
  loading = false,
  variant = 'primary',
  disabled,
  className,
  ...props
}: ButtonProps & { className?: string }) {
  const base =
    variant === 'primary'
      ? 'bg-sgvu-navy active:bg-sgvu-navy/90'
      : 'bg-sgvu-surface border border-sgvu-navy/15 active:bg-sgvu-navy/10';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      className={`rounded-xl px-4 py-3 items-center justify-center ${base} ${disabled || loading ? 'opacity-60' : ''} ${className ?? ''}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#ffffff' : '#08234a'} />
      ) : (
        <Text
          className={`text-base font-semibold ${variant === 'primary' ? 'text-white' : 'text-sgvu-navy'}`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
