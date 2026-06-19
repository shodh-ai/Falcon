import { Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { CardSkeleton } from '@/components/Skeleton';
import { usePlacementHub } from '@/hooks/useAcademics';

export default function PlacementsScreen() {
  const hub = usePlacementHub();
  const isRefreshing = hub.isRefetching;

  return (
    <Screen scroll refreshing={isRefreshing} onRefresh={() => void hub.refetch()}>
      <View className="gap-4 pb-6">
        {hub.isLoading ? (
          <CardSkeleton lines={3} />
        ) : (
          <>
            <Card className="flex-row gap-4">
              <View>
                <Text className="text-xs text-sgvu-navy/50">CGPA</Text>
                <Text className="text-xl font-black text-sgvu-navy">
                  {hub.data?.student_cgpa?.toFixed(2) ?? '—'}
                </Text>
              </View>
              <View>
                <Text className="text-xs text-sgvu-navy/50">Backlogs</Text>
                <Text className="text-xl font-black text-sgvu-navy">
                  {hub.data?.student_backlogs ?? 0}
                </Text>
              </View>
            </Card>

            <Text className="text-base font-bold text-sgvu-navy">Open Drives</Text>
            {(hub.data?.open_drives ?? []).length === 0 ? (
              <Card>
                <Text className="text-sm text-sgvu-navy/60">No open placement drives right now.</Text>
              </Card>
            ) : (
              (hub.data?.open_drives ?? []).map((drive) => (
                <Card key={drive.drive_id}>
                  <Text className="text-base font-bold text-sgvu-navy">{drive.company_name}</Text>
                  <Text className="text-sm text-sgvu-navy/70 mt-1">
                    {drive.job_title ?? drive.job_role ?? 'Role TBA'}
                  </Text>
                  <Text className="text-xs text-sgvu-gold mt-2">
                    Min CGPA: {drive.min_cgpa}
                    {drive.package_lpa ? ` · ₹${drive.package_lpa} LPA` : ''}
                  </Text>
                </Card>
              ))
            )}

            <Text className="text-base font-bold text-sgvu-navy mt-2">My Applications</Text>
            {(hub.data?.my_applications ?? []).length === 0 ? (
              <Card>
                <Text className="text-sm text-sgvu-navy/60">You haven&apos;t applied to any drives yet.</Text>
              </Card>
            ) : (
              (hub.data?.my_applications ?? []).map((app) => (
                <Card key={app.application_id}>
                  <Text className="text-sm font-semibold text-sgvu-navy">Drive {app.drive_id.slice(0, 8)}…</Text>
                  <Text className="text-xs text-sgvu-gold mt-1">{app.status}</Text>
                </Card>
              ))
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
