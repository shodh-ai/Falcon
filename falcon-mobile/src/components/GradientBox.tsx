import { useState, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';

interface GradientBoxProps extends ViewProps {
  children: ReactNode;
  className?: string;
}

export function GradientBox({ children, className, ...props }: GradientBoxProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  return (
    <View
      className={`rounded-2xl overflow-hidden ${className ?? ''}`}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize({ width, height });
      }}
      {...props}
    >
      {size.width > 0 && size.height > 0 ? (
        <Svg
          width={size.width}
          height={size.height}
          style={{ position: 'absolute', left: 0, top: 0 }}
        >
          <Defs>
            <SvgGradient id="falconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#08234a" />
              <Stop offset="55%" stopColor="#0c3a6e" />
              <Stop offset="100%" stopColor="#d6b65d" />
            </SvgGradient>
          </Defs>
          <Rect width={size.width} height={size.height} fill="url(#falconGrad)" />
        </Svg>
      ) : (
        <View className="absolute inset-0 bg-sgvu-navy" />
      )}
      <View className="absolute right-0 top-0 h-24 w-24 rounded-full bg-sgvu-gold/20" />
      <View className="relative p-5">{children}</View>
    </View>
  );
}
