import { Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { CardSkeleton } from '@/components/Skeleton';
import { useCampusEvents } from '@/hooks/useAcademics';

export default function EventsScreen() {
  const events = useCampusEvents();
  const isRefreshing = events.isRefetching;

  return (
    <Screen scroll refreshing={isRefreshing} onRefresh={() => void events.refetch()}>
      <View className="gap-4 pb-6">
        {events.isLoading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (events.data ?? []).length === 0 ? (
          <Card>
            <Text className="text-sm text-sgvu-navy/60">No upcoming events right now.</Text>
          </Card>
        ) : (
          (events.data ?? []).map((event) => (
            <Card key={event.event_id}>
              <Text className="text-base font-bold text-sgvu-navy">{event.title}</Text>
              {event.venue_name ? (
                <Text className="text-sm text-sgvu-gold mt-1">{event.venue_name}</Text>
              ) : null}
              <Text className="text-xs text-sgvu-navy/60 mt-2">
                {new Date(event.start_at).toLocaleString()} —{' '}
                {new Date(event.end_at).toLocaleString()}
              </Text>
              {event.description ? (
                <Text className="text-sm text-sgvu-navy/70 mt-2" numberOfLines={3}>
                  {event.description}
                </Text>
              ) : null}
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
