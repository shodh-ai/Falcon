import { useState } from 'react';
import { Text, TextInput, View, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { CardSkeleton } from '@/components/Skeleton';
import { useProctorAssignment, useProctorChat } from '@/hooks/useAcademics';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

export default function MentorshipScreen() {
  const assignment = useProctorAssignment();
  const chat = useProctorChat();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const isRefreshing = assignment.isRefetching || chat.isRefetching;
  const onRefresh = () => {
    void assignment.refetch();
    void chat.refetch();
  };

  const sendMessage = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await api.post('/api/academics/proctor/chat', { message: message.trim() });
      setMessage('');
      await queryClient.invalidateQueries({ queryKey: ['proctor', 'chat'] });
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen scroll refreshing={isRefreshing} onRefresh={onRefresh}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="gap-4 pb-6">
          {assignment.isLoading ? (
            <CardSkeleton lines={2} />
          ) : !assignment.data ? (
            <Card>
              <Text className="text-sm text-sgvu-navy/60">No proctor assigned yet.</Text>
            </Card>
          ) : (
            <Card>
              <Text className="text-xs text-sgvu-navy/50">Your Proctor</Text>
              <Text className="text-lg font-bold text-sgvu-navy mt-1">
                {assignment.data.proctor.name}
              </Text>
              <Text className="text-sm text-sgvu-navy/60">{assignment.data.proctor.email}</Text>
            </Card>
          )}

          <Card>
            <Text className="text-base font-bold text-sgvu-navy mb-3">Chat</Text>
            {chat.isLoading ? (
              <CardSkeleton lines={3} />
            ) : (chat.data ?? []).length === 0 ? (
              <Text className="text-sm text-sgvu-navy/60">Start a conversation with your proctor.</Text>
            ) : (
              <View className="gap-2">
                {(chat.data ?? []).map((msg) => (
                  <View
                    key={msg.message_id}
                    className={`rounded-xl p-3 max-w-[85%] ${
                      msg.sender_type === 'STUDENT'
                        ? 'bg-sgvu-navy self-end'
                        : 'bg-sgvu-surface self-start'
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        msg.sender_type === 'STUDENT' ? 'text-white' : 'text-sgvu-navy'
                      }`}
                    >
                      {msg.message_text}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <View className="flex-row gap-2">
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Message your proctor…"
              className="flex-1 rounded-xl border border-sgvu-navy/15 bg-white px-4 py-3 text-sgvu-navy"
              placeholderTextColor="#08234a60"
            />
            <Pressable
              onPress={sendMessage}
              disabled={sending}
              className="rounded-xl bg-sgvu-navy px-4 items-center justify-center"
            >
              <Text className="text-white font-semibold">{sending ? '…' : 'Send'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
