import { useEffect } from 'react';
import { View, type DimensionValue, type ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface SkeletonProps extends ViewProps {
  width?: DimensionValue;
  height?: number;
  radius?: number | 'round';
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 8,
  className,
}: SkeletonProps) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0.4, { duration: 700 })),
      -1,
      false,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const borderRadius = radius === 'round' ? height / 2 : radius;

  return (
    <View className={className} style={{ width, height }}>
      <Animated.View
        style={[
          {
            width: '100%',
            height: '100%',
            borderRadius,
            backgroundColor: '#08234a18',
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <View className="rounded-2xl bg-white p-5 shadow-sm gap-3">
      <Skeleton width="60%" height={20} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '40%' : '100%'} height={14} />
      ))}
    </View>
  );
}

export function SubjectCardSkeleton() {
  return (
    <View className="flex-row items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
      <View className="flex-1 gap-2">
        <Skeleton width="40%" height={14} />
        <Skeleton width="70%" height={18} />
      </View>
      <Skeleton width={48} height={48} radius="round" />
    </View>
  );
}

export function TimelineSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View className="gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} className="flex-row gap-3">
          <Skeleton width={12} height={12} radius="round" />
          <View className="flex-1 gap-2">
            <Skeleton width="50%" height={16} />
            <Skeleton width="80%" height={14} />
          </View>
        </View>
      ))}
    </View>
  );
}
