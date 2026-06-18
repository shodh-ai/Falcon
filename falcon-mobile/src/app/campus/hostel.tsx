import { Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { CardSkeleton } from '@/components/Skeleton';
import { useHostelAllocation } from '@/hooks/useAcademics';

export default function HostelScreen() {
  const allocation = useHostelAllocation();
  const isRefreshing = allocation.isRefetching;

  return (
    <Screen scroll refreshing={isRefreshing} onRefresh={() => void allocation.refetch()}>
      <View className="gap-4 pb-6">
        {allocation.isLoading ? (
          <CardSkeleton lines={4} />
        ) : !allocation.data ? (
          <Card>
            <Text className="text-sm text-sgvu-navy/60">
              No active hostel allocation. Apply via the web portal.
            </Text>
          </Card>
        ) : (
          <Card>
            <Text className="text-lg font-bold text-sgvu-navy">
              {allocation.data.hostel_block ?? 'Hostel'} · Room {allocation.data.room_number}
            </Text>
            <Text className="text-sm text-sgvu-navy/60 mt-2">
              Bed {allocation.data.bed_number} · {allocation.data.mess_plan} mess
            </Text>
            <Text className="text-sm text-sgvu-navy/60 mt-1">
              {allocation.data.start_date} → {allocation.data.end_date}
            </Text>
            {allocation.data.warden ? (
              <View className="mt-4 pt-4 border-t border-sgvu-navy/10">
                <Text className="text-xs text-sgvu-navy/50">Warden</Text>
                <Text className="text-sm font-semibold text-sgvu-navy mt-1">
                  {allocation.data.warden.name}
                </Text>
              </View>
            ) : null}
          </Card>
        )}

        <Card className="bg-sgvu-gold/10 border border-sgvu-gold/30">
          <Text className="text-base font-bold text-sgvu-navy">Gate Pass & Mess</Text>
          <Text className="text-sm text-sgvu-navy/70 mt-2">
            Raise gate pass requests and view today&apos;s mess menu from the web portal Hostel
            desk. Mobile pre-order coming soon.
          </Text>
        </Card>
      </View>
    </Screen>
  );
}
