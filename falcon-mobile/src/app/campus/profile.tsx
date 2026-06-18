import { Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useAuthStore } from '@/lib/store';
import { useStudentProfile } from '@/hooks/useAcademics';

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const profile = useStudentProfile();
  const theme = useAuthStore((state) => state.theme);
  const setTheme = useAuthStore((state) => state.setTheme);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <Screen scroll onRefresh={() => void profile.refetch()} refreshing={profile.isRefetching}>
      <View className="gap-4 pb-6">
        <Card className="items-center py-6">
          <ProfileAvatar
            name={user?.name}
            photoUrl={profile.data?.profile_photo_url}
            size={80}
          />
          <Text className="text-xl font-bold text-sgvu-navy mt-4">{user?.name}</Text>
          <Text className="text-sm text-sgvu-navy/70">{user?.email}</Text>
          <Text className="text-sm text-sgvu-navy/50 mt-1">Role: {user?.role}</Text>
        </Card>

        <Card className="flex-row items-center justify-between">
          <View>
            <Text className="text-base font-semibold text-sgvu-navy">Dark Mode</Text>
            <Text className="text-sm text-sgvu-navy/70">Toggle theme preference</Text>
          </View>
          <Switch
            value={theme === 'dark'}
            onValueChange={(enabled) => setTheme(enabled ? 'dark' : 'light')}
            trackColor={{ false: '#cbd5e1', true: '#08234a' }}
            thumbColor="#ffffff"
          />
        </Card>

        <Button label="Sign Out" variant="secondary" onPress={handleLogout} />
      </View>
    </Screen>
  );
}
