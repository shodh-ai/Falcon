import { Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GradientBox } from '@/components/GradientBox';
import { ProfileAvatar } from '@/components/ProfileAvatar';

interface GradientHeaderProps {
  title: string;
  subtitle?: string;
  photoUrl?: string | null;
  name?: string;
  unreadCount?: number;
  onNotificationPress?: () => void;
}

export function GradientHeader({
  title,
  subtitle,
  photoUrl,
  name,
  unreadCount = 0,
  onNotificationPress,
}: GradientHeaderProps) {
  const router = useRouter();

  return (
    <GradientBox>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          {subtitle ? (
            <Text className="text-sm font-medium text-white/80">{subtitle}</Text>
          ) : null}
          <Text className="text-2xl font-bold text-white mt-1">{title}</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={onNotificationPress ?? (() => router.push('/campus/notifications'))}
            className="relative p-2"
            hitSlop={8}
          >
            <Ionicons name="notifications-outline" size={24} color="#ffffff" />
            {unreadCount > 0 ? (
              <View className="absolute -right-0.5 -top-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 items-center justify-center px-1">
                <Text className="text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <ProfileAvatar name={name} photoUrl={photoUrl} size={44} />
        </View>
      </View>
    </GradientBox>
  );
}
