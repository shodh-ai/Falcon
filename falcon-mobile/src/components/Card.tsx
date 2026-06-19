import { View, type ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  className?: string;
}

export function Card({ children, className, ...props }: CardProps) {
  return (
    <View
      className={`rounded-2xl bg-white p-5 shadow-md shadow-sgvu-navy/10 ${className ?? ''}`}
      style={{
        shadowColor: '#08234a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
      }}
      {...props}
    >
      {children}
    </View>
  );
}
