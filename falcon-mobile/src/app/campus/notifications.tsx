import { Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { CardSkeleton } from '@/components/Skeleton';
import { useRecentNotifications } from '@/hooks/useAcademics';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

export default function NotificationsScreen() {
  const notifications = useRecentNotifications();
  const queryClient = useQueryClient();
  const isRefreshing = notifications.isRefetching;

  const markRead = async (id: string) => {
    await api.patch(`/api/notifications/${id}/read`);
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <Screen scroll refreshing={isRefreshing} onRefresh={() => void notifications.refetch()}>
      <View className="gap-3 pb-6">
        {notifications.isLoading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (notifications.data ?? []).length === 0 ? (
          <Card>
            <Text className="text-sm text-sgvu-navy/60">No notifications yet.</Text>
          </Card>
        ) : (
          (notifications.data ?? []).map((n) => (
            <Pressable key={n.notification_id} onPress={() => void markRead(n.notification_id)}>
              <Card className={!n.is_read ? 'border-l-4 border-sgvu-gold' : ''}>
                <Text className="text-sm font-bold text-sgvu-navy">{n.title}</Text>
                <Text className="text-sm text-sgvu-navy/70 mt-1">{n.message}</Text>
                <Text className="text-xs text-sgvu-navy/40 mt-2">
                  {new Date(n.created_at).toLocaleString()}
                </Text>
              </Card>
            </Pressable>
          ))
        )}
      </View>
    </Screen>
  );
}
