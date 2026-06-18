import { Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { GradientBox } from '@/components/GradientBox';
import { CampusHubTile, HUB_TILES } from '@/components/CampusHubTile';
import { useAuthStore } from '@/lib/store';

export default function CampusHubScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  return (
    <Screen scroll onRefresh={() => {}} refreshing={false}>
      <View className="gap-4 pb-8">
        <GradientBox>
          <Text className="text-sm text-white/80">Campus Hub</Text>
          <Text className="text-2xl font-bold text-white mt-1">
            Everything else, one tap away
          </Text>
          <Text className="text-sm text-white/70 mt-2">
            {user?.name ?? 'Student'} · {user?.department ?? 'Campus OS'}
          </Text>
        </GradientBox>

        <Card className="p-3">
          <View className="flex-row flex-wrap gap-0">
            <View className="w-1/3 p-1.5">
              <CampusHubTile
                tile={HUB_TILES[0]}
                onPress={() => router.push(HUB_TILES[0].route as Href)}
              />
            </View>
            <View className="w-1/3 p-1.5">
              <CampusHubTile
                tile={HUB_TILES[1]}
                onPress={() => router.push(HUB_TILES[1].route as Href)}
              />
            </View>
            <View className="w-1/3 p-1.5">
              <CampusHubTile
                tile={HUB_TILES[2]}
                onPress={() => router.push(HUB_TILES[2].route as Href)}
              />
            </View>
            <View className="w-1/3 p-1.5">
              <CampusHubTile
                tile={HUB_TILES[3]}
                onPress={() => router.push(HUB_TILES[3].route as Href)}
              />
            </View>
            <View className="w-1/3 p-1.5">
              <CampusHubTile
                tile={HUB_TILES[4]}
                onPress={() => router.push(HUB_TILES[4].route as Href)}
              />
            </View>
            <View className="w-1/3 p-1.5">
              <CampusHubTile
                tile={HUB_TILES[5]}
                onPress={() => router.push(HUB_TILES[5].route as Href)}
              />
            </View>
            <View className="w-1/3 p-1.5">
              <CampusHubTile
                tile={HUB_TILES[6]}
                onPress={() => router.push(HUB_TILES[6].route as Href)}
              />
            </View>
            <View className="w-1/3 p-1.5">
              <CampusHubTile
                tile={HUB_TILES[7]}
                onPress={() => router.push(HUB_TILES[7].route as Href)}
              />
            </View>
            <View className="w-1/3 p-1.5">
              <CampusHubTile
                tile={HUB_TILES[8]}
                onPress={() => router.push(HUB_TILES[8].route as Href)}
              />
            </View>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
