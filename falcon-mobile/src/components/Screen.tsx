import { useCallback } from 'react';
import { RefreshControl, ScrollView, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenProps extends ViewProps {
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  refreshing = false,
  onRefresh,
  className,
  ...props
}: ScreenProps & { className?: string }) {
  const padding = padded ? 'px-4 py-4' : '';
  const contentClass = `flex-grow bg-sgvu-surface ${padding} ${className ?? ''}`;

  const refreshControl =
    onRefresh != null ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor="#08234a"
        colors={['#08234a', '#d6b65d']}
      />
    ) : undefined;

  if (scroll) {
    return (
      <SafeAreaView className="flex-1 bg-sgvu-surface" edges={['left', 'right']}>
        <ScrollView
          contentContainerClassName={contentClass}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-sgvu-surface" edges={['left', 'right']}>
      <View className={`flex-1 bg-sgvu-surface ${padding} ${className ?? ''}`} {...props}>
        {children}
      </View>
    </SafeAreaView>
  );
}

export function useScreenRefresh(refetchFns: Array<() => Promise<unknown>>) {
  const refreshing = false;
  const onRefresh = useCallback(async () => {
    await Promise.all(refetchFns.map((fn) => fn()));
  }, [refetchFns]);
  return { refreshing, onRefresh };
}
