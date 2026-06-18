import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface AttendanceRingProps {
  percent: number;
  size?: number;
  label?: string;
  glowWhenLow?: boolean;
}

export function AttendanceRing({
  percent,
  size = 120,
  label = 'Attendance',
  glowWhenLow = true,
}: AttendanceRingProps) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference - (clamped / 100) * circumference;
  const isLow = clamped < 75;
  const ringColor = isLow ? '#ef4444' : '#d6b65d';

  return (
    <View className="items-center">
      <View
        style={
          glowWhenLow && isLow
            ? {
                shadowColor: '#ef4444',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6,
                shadowRadius: 16,
              }
            : undefined
        }
      >
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e2e8f0"
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className={`font-black text-sgvu-navy ${size > 60 ? 'text-3xl' : 'text-sm'}`}>
            {Math.round(clamped)}%
          </Text>
          {label ? <Text className="text-xs text-sgvu-navy/60 mt-0.5">{label}</Text> : null}
        </View>
      </View>
    </View>
  );
}

export function MiniAttendanceRing({ percent, size = 48 }: { percent: number; size?: number }) {
  return <AttendanceRing percent={percent} size={size} label="" glowWhenLow={false} />;
}
