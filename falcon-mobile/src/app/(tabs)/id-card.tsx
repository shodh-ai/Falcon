import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-svg';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAuthStore } from '@/lib/store';
import { useCampusWallet } from '@/hooks/useAcademics';
import { api } from '@/lib/api';

export default function IdCardScreen() {
  const user = useAuthStore((state) => state.user);
  const wallet = useCampusWallet();
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString());
  const pulse = useSharedValue(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setIssuedAt(new Date().toISOString());
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.04, { duration: 1200 }), withTiming(1, { duration: 1200 })),
      -1,
      false,
    );
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const qrValue = JSON.stringify({
    type: 'falcon_student_pass',
    user_id: user?.user_id,
    email: user?.email,
    name: user?.name,
    tenant_id: user?.tenant_id,
    issued_at: issuedAt,
  });

  const balance = Number(wallet.data?.current_balance ?? 0);
  const isRefreshing = wallet.isRefetching;

  const onRefresh = () => {
    setIssuedAt(new Date().toISOString());
    void wallet.refetch();
  };

  const handleTopUp = async () => {
    try {
      await api.post('/api/wallet/topup/order', { amount_inr: 500 });
      Alert.alert('UPI Top-up', 'Payment order created. Complete via your UPI app.');
      void wallet.refetch();
    } catch (e) {
      Alert.alert('Top-up failed', e instanceof Error ? e.message : 'Could not create order');
    }
  };

  return (
    <Screen scroll refreshing={isRefreshing} onRefresh={onRefresh}>
      <View className="gap-4 pb-6">
        <Card className="items-center py-6">
          <Text className="text-xl font-bold text-sgvu-navy">{user?.name ?? 'Student'}</Text>
          <Text className="mt-1 text-sm text-sgvu-navy/70">{user?.email}</Text>

          <Animated.View style={pulseStyle} className="my-6 rounded-2xl bg-white p-4 shadow-md">
            <QRCode value={qrValue} size={220} backgroundColor="#ffffff" color="#08234a" />
          </Animated.View>

          <View className="flex-row items-center gap-2">
            <View className="w-2 h-2 rounded-full bg-emerald-500" />
            <Text className="text-xs text-sgvu-navy/60">Live · refreshes every 30s</Text>
          </View>
        </Card>

        <Card>
          <Text className="text-sm font-semibold text-sgvu-navy/60">Falcon Pay Balance</Text>
          {wallet.isLoading ? (
            <View className="mt-2 h-8 w-32 bg-sgvu-navy/5 rounded" />
          ) : (
            <Text className="text-3xl font-black text-sgvu-navy mt-1">
              ₹ {balance.toFixed(2)}
            </Text>
          )}
          <Button
            label="Add Funds via UPI"
            onPress={handleTopUp}
            className="mt-4"
          />
        </Card>

        <Card className="bg-sgvu-navy/5 border border-sgvu-navy/10">
          <Text className="text-sm text-sgvu-navy/70 text-center">
            Show this QR at mess counters, library gates, and campus checkpoints.
          </Text>
        </Card>
      </View>
    </Screen>
  );
}
