import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { GradientHeader } from '@/components/GradientHeader';
import { Card } from '@/components/Card';
import { AttendanceRing } from '@/components/AttendanceRing';
import { CardSkeleton, TimelineSkeleton } from '@/components/Skeleton';
import { useAuthStore } from '@/lib/store';
import {
  useDashboardMetrics,
  useRecentNotifications,
  useNoticeBoard,
  useStudentProfile,
  useTodayTimetable,
  useUnreadNotificationCount,
} from '@/hooks/useAcademics';
import type { TimetableSlot } from '@/types/academics';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatTime(time: string) {
  return time.slice(0, 5);
}

function TimelineItem({ slot, isLast }: { slot: TimetableSlot; isLast: boolean }) {
  const statusColor =
    slot.status === 'ongoing' ? 'bg-sgvu-gold' : slot.status === 'done' ? 'bg-sgvu-navy/30' : 'bg-sgvu-navy';

  return (
    <View className="flex-row gap-3">
      <View className="items-center">
        <View className={`w-3 h-3 rounded-full ${statusColor}`} />
        {!isLast ? <View className="w-0.5 flex-1 bg-sgvu-navy/15 mt-1 min-h-[40px]" /> : null}
      </View>
      <View className="flex-1 pb-4">
        <Text className="text-xs font-semibold text-sgvu-gold">
          {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
        </Text>
        <Text className="text-base font-bold text-sgvu-navy mt-0.5">
          {slot.course_code} — {slot.course_name}
        </Text>
        <Text className="text-sm text-sgvu-navy/60 mt-1">
          Room {slot.room}
          {slot.faculty_name ? ` · ${slot.faculty_name}` : ''}
        </Text>
        {slot.status === 'ongoing' ? (
          <View className="mt-2 self-start rounded-full bg-sgvu-gold/20 px-2 py-0.5">
            <Text className="text-xs font-semibold text-sgvu-navy">Live now</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const metrics = useDashboardMetrics();
  const timetable = useTodayTimetable();
  const profile = useStudentProfile();
  const notifications = useRecentNotifications();
  const noticeBoard = useNoticeBoard();
  const unreadCount = useUnreadNotificationCount();

  const attendance = metrics.data?.attendance_percent ?? 0;
  const alertItems = useMemo(
    () => (notifications.data ?? []).filter((n) => !n.is_read).slice(0, 5),
    [notifications.data],
  );

  const isRefreshing =
    metrics.isRefetching || timetable.isRefetching || notifications.isRefetching;

  const onRefresh = () => {
    void metrics.refetch();
    void timetable.refetch();
    void notifications.refetch();
    void unreadCount.refetch();
    void profile.refetch();
  };

  return (
    <Screen
      scroll
      refreshing={isRefreshing}
      onRefresh={onRefresh}
    >
      <View className="gap-4 pb-6">
        <GradientHeader
          subtitle={greeting()}
          title={`Hi, ${user?.name?.split(' ')[0] ?? 'Student'}`}
          name={user?.name}
          photoUrl={profile.data?.profile_photo_url}
          unreadCount={unreadCount.data ?? 0}
        />

        <Card className="items-center py-6">
          {metrics.isLoading ? (
            <View className="h-[120px] w-[120px] rounded-full bg-sgvu-navy/5" />
          ) : (
            <AttendanceRing percent={attendance} label="Overall" />
          )}
          {!metrics.isLoading && attendance < 75 ? (
            <Text className="text-sm font-medium text-red-500 mt-3">
              Below 75% minimum — attend upcoming classes
            </Text>
          ) : null}
        </Card>

        {(noticeBoard.data ?? []).length > 0 ? (
          <Card>
            <Text className="text-lg font-bold text-sgvu-navy">Notice Board</Text>
            <View className="mt-3 gap-3">
              {(noticeBoard.data ?? []).slice(0, 3).map((item) => (
                <View key={item.announcement_id}>
                  <Text className="text-sm font-bold text-sgvu-navy">{item.title}</Text>
                  <Text className="text-xs text-sgvu-navy/60 mt-1" numberOfLines={2}>
                    {item.body_html.replace(/<[^>]+>/g, '')}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          <Text className="text-lg font-bold text-sgvu-navy">Today&apos;s Timeline</Text>
          <View className="mt-4">
            {timetable.isLoading ? (
              <TimelineSkeleton count={4} />
            ) : (timetable.data ?? []).length === 0 ? (
              <Text className="text-sm text-sgvu-navy/60">No classes scheduled for today.</Text>
            ) : (
              (timetable.data ?? []).map((slot, i, arr) => (
                <TimelineItem key={slot.timetable_id} slot={slot} isLast={i === arr.length - 1} />
              ))
            )}
          </View>
        </Card>

        <View>
          <Text className="text-lg font-bold text-sgvu-navy mb-3">Actionable Alerts</Text>
          {notifications.isLoading ? (
            <CardSkeleton lines={2} />
          ) : alertItems.length === 0 ? (
            <Card>
              <Text className="text-sm text-sgvu-navy/60">You&apos;re all caught up!</Text>
            </Card>
          ) : (
            alertItems.map((alert) => (
              <Pressable
                key={alert.notification_id}
                onPress={() => router.push('/campus/notifications')}
              >
                <Card className="mb-3 border-l-4 border-sgvu-gold">
                  <View className="flex-row items-start gap-2">
                    <Ionicons
                      name={
                        alert.intent === 'action_required'
                          ? 'alert-circle'
                          : 'notifications-outline'
                      }
                      size={20}
                      color="#d6b65d"
                    />
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-sgvu-navy">{alert.title}</Text>
                      <Text className="text-sm text-sgvu-navy/70 mt-1" numberOfLines={2}>
                        {alert.message}
                      </Text>
                      {alert.action_label ? (
                        <Text className="text-xs font-semibold text-sgvu-gold mt-2">
                          {alert.action_label} →
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </View>
      </View>
    </Screen>
  );
}
