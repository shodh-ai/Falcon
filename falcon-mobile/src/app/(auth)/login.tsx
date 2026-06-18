import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { getApiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)/home');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center gap-6 py-8"
      >
        <View className="gap-2">
          <Text className="text-3xl font-black text-sgvu-navy">Falcon Student</Text>
          <Text className="text-base text-sgvu-navy/70">
            Sign in with your university email to access timetable, attendance, and campus passes.
          </Text>
        </View>

        <View className="gap-4 rounded-2xl border border-sgvu-navy/10 bg-white p-5">
          <Input
            label="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="student@university.edu"
          />
          <Input
            label="Password"
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
          />
          {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
          <Button label="Sign In" loading={loading} onPress={handleLogin} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
