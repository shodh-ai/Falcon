import { useState } from 'react';
import { Text, TextInput, View, Alert } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { CardSkeleton } from '@/components/Skeleton';
import { useHelpdeskTickets } from '@/hooks/useAcademics';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

export default function HelpdeskScreen() {
  const tickets = useHelpdeskTickets();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isRefreshing = tickets.isRefetching;

  const submitTicket = async () => {
    if (subject.length < 5 || description.length < 10) {
      Alert.alert('Invalid', 'Subject (5+ chars) and description (10+ chars) required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/helpdesk/tickets', {
        category: 'ACADEMICS',
        subject,
        description,
      });
      setSubject('');
      setDescription('');
      await queryClient.invalidateQueries({ queryKey: ['helpdesk', 'tickets'] });
      Alert.alert('Submitted', 'Your grievance ticket has been raised.');
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll refreshing={isRefreshing} onRefresh={() => void tickets.refetch()}>
      <View className="gap-4 pb-6">
        <Card>
          <Text className="text-base font-bold text-sgvu-navy mb-3">Raise a Ticket</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject"
            className="rounded-xl border border-sgvu-navy/15 bg-white px-4 py-3 text-sgvu-navy mb-3"
            placeholderTextColor="#08234a60"
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your issue…"
            multiline
            numberOfLines={4}
            className="rounded-xl border border-sgvu-navy/15 bg-white px-4 py-3 text-sgvu-navy mb-3 min-h-[100px]"
            placeholderTextColor="#08234a60"
            textAlignVertical="top"
          />
          <Button label="Submit Ticket" onPress={submitTicket} loading={submitting} />
        </Card>

        <Text className="text-base font-bold text-sgvu-navy">My Tickets</Text>
        {tickets.isLoading ? (
          <CardSkeleton lines={3} />
        ) : (tickets.data ?? []).length === 0 ? (
          <Card>
            <Text className="text-sm text-sgvu-navy/60">No tickets raised yet.</Text>
          </Card>
        ) : (
          (tickets.data ?? []).map((ticket) => (
            <Card key={ticket.ticket_id}>
              <View className="flex-row justify-between">
                <Text className="text-xs font-semibold text-sgvu-gold">{ticket.ticket_ref}</Text>
                <Text className="text-xs text-sgvu-navy/50">{ticket.status}</Text>
              </View>
              <Text className="text-sm font-bold text-sgvu-navy mt-2">{ticket.subject}</Text>
              <Text className="text-xs text-sgvu-navy/60 mt-1">{ticket.category}</Text>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
