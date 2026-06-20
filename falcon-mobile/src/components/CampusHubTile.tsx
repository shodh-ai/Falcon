import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface HubTile {
  id: string;
  label: string;
  icon: IconName;
  color: string;
  bg: string;
  route: string;
}

export const HUB_TILES: HubTile[] = [
  {
    id: 'transport',
    label: 'Transport',
    icon: 'bus-outline',
    color: '#08234a',
    bg: '#dbeafe',
    route: '/campus/transport',
  },
  {
    id: 'hostel',
    label: 'Hostel & Mess',
    icon: 'bed-outline',
    color: '#08234a',
    bg: '#fef3c7',
    route: '/campus/hostel',
  },
  {
    id: 'events',
    label: 'Events & Clubs',
    icon: 'ticket-outline',
    color: '#08234a',
    bg: '#fce7f3',
    route: '/campus/events',
  },
  {
    id: 'ecell',
    label: 'E-Cell Hub',
    icon: 'rocket-outline',
    color: '#08234a',
    bg: '#fff7ed',
    route: '/campus/ecell',
  },
  {
    id: 'mentorship',
    label: 'Mentorship',
    icon: 'chatbubbles-outline',
    color: '#08234a',
    bg: '#d1fae5',
    route: '/campus/mentorship',
  },
  {
    id: 'placements',
    label: 'Placements',
    icon: 'briefcase-outline',
    color: '#08234a',
    bg: '#e0e7ff',
    route: '/campus/placements',
  },
  {
    id: 'helpdesk',
    label: 'Helpdesk',
    icon: 'help-buoy-outline',
    color: '#08234a',
    bg: '#fee2e2',
    route: '/campus/helpdesk',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: 'notifications-outline',
    color: '#08234a',
    bg: '#f3e8ff',
    route: '/campus/notifications',
  },
  {
    id: 'profile',
    label: 'My Account',
    icon: 'person-outline',
    color: '#08234a',
    bg: '#f1f5f9',
    route: '/campus/profile',
  },
  {
    id: 'finance',
    label: 'Fee Finance',
    icon: 'card-outline',
    color: '#08234a',
    bg: '#ecfdf5',
    route: '/campus/profile',
  },
];

interface CampusHubTileProps {
  tile: HubTile;
  onPress: () => void;
}

export function CampusHubTile({ tile, onPress }: CampusHubTileProps) {
  return (
    <Pressable
      onPress={onPress}
      className="items-center justify-center rounded-2xl p-4 aspect-square"
      style={{ backgroundColor: tile.bg }}
    >
      <View
        className="w-12 h-12 rounded-2xl items-center justify-center mb-2"
        style={{ backgroundColor: 'rgba(255,255,255,0.7)' }}
      >
        <Ionicons name={tile.icon} size={26} color={tile.color} />
      </View>
      <Text className="text-xs font-semibold text-sgvu-navy text-center" numberOfLines={2}>
        {tile.label}
      </Text>
    </Pressable>
  );
}
