import { Stack } from 'expo-router';

export default function CampusLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#08234a' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700' },
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen name="transport" options={{ title: 'Live Bus Tracker' }} />
      <Stack.Screen name="hostel" options={{ title: 'Hostel & Mess' }} />
      <Stack.Screen name="events" options={{ title: 'Events & Clubs' }} />
      <Stack.Screen name="ecell" options={{ title: 'E-Cell Hub' }} />
      <Stack.Screen name="mentorship" options={{ title: 'Mentorship' }} />
      <Stack.Screen name="placements" options={{ title: 'Placements' }} />
      <Stack.Screen name="helpdesk" options={{ title: 'Helpdesk' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="profile" options={{ title: 'My Account' }} />
    </Stack>
  );
}
