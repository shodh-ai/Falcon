import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

if (Platform.OS === 'web') {
  const stylesheet = StyleSheet as typeof StyleSheet & {
    setFlag?: (name: string, value: string) => void;
  };
  stylesheet.setFlag?.('darkMode', 'class');
}
import { Stack, useRouter, useSegments } from 'expo-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';
import '../../global.css';
import { subscribeUnauthorized } from '@/lib/auth-events';
import { queryClient, queryPersistOptions } from '@/lib/query-client';
import { useAuthStore } from '@/lib/store';

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  useEffect(() => {
    if (!isHydrated) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)/home');
    }
  }, [isAuthenticated, isHydrated, router, segments]);

  if (!isHydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-sgvu-surface">
        <ActivityIndicator size="large" color="#08234a" />
      </View>
    );
  }

  return children;
}

export default function RootLayout() {
  const hydrate = useAuthStore((state) => state.hydrate);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => subscribeUnauthorized(() => void logout()), [logout]);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={queryPersistOptions}>
      <StatusBar style="auto" />
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthGate>
    </PersistQueryClientProvider>
  );
}
