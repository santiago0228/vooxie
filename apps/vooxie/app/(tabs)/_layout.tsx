import { useEffect, useRef } from "react";
import { Tabs, useRouter } from "expo-router";
import { View, Animated, type ColorValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomTabBar, type BottomTabBarProps } from "expo-router/tabs";
import { useTheme, MiniPlayer } from "@vooxie/ui";
import {
  usePlayerStore,
  getItemTitle,
  getItemArtistName,
  getItemCoverUrl,
  type PlayerState,
} from "@vooxie/core";
import { getCachedAtmosphere } from "../../src/player/useDominantColor";

/**
 * Envuelve el tab bar por defecto para poder dibujar el MiniPlayer justo
 * arriba — Expo Router reenvía props extra de <Tabs> al navigator de
 * react-navigation por debajo, así que "tabBar" funciona igual que en un
 * bottom tab navigator normal.
 */
function TabBarWithMiniPlayer(props: BottomTabBarProps) {
  const router = useRouter();
  const currentTrack = usePlayerStore((s: PlayerState) => s.currentTrack);
  const status = usePlayerStore((s: PlayerState) => s.status);
  const positionSeconds = usePlayerStore((s: PlayerState) => s.positionSeconds);
  const durationSeconds = usePlayerStore((s: PlayerState) => s.durationSeconds);
  const togglePlayPause = usePlayerStore((s: PlayerState) => s.togglePlayPause);

  // Atmósfera real de la canción actual desde caché (sin recalcular)
  const coverUrl = currentTrack ? getItemCoverUrl(currentTrack) : null;
  const atm = getCachedAtmosphere(coverUrl);

  return (
    <View style={{ backgroundColor: "transparent" }}>
      {currentTrack ? (
        <MiniPlayer
          title={getItemTitle(currentTrack)}
          artistName={getItemArtistName(currentTrack)}
          coverUrl={getItemCoverUrl(currentTrack)}
          isPlaying={status === "playing"}
          isLoading={status === "loading"}
          positionSeconds={positionSeconds}
          durationSeconds={durationSeconds}
          atmBg={atm.bg}
          onTogglePlay={togglePlayPause}
          onPress={() => router.push("/player")}
        />
      ) : null}
      <BottomTabBar {...props} />
    </View>
  );
}

function TabIcon({
  focused,
  outlineName,
  filledName,
  color,
}: {
  focused: boolean;
  outlineName: keyof typeof Ionicons.glyphMap;
  filledName: keyof typeof Ionicons.glyphMap;
  color: ColorValue;
}) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0.94)).current;

  useEffect(() => {
    Animated.timing(scale, {
      toValue: focused ? 1 : 0.94,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [focused, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons
        name={focused ? filledName : outlineName}
        size={24}
        color={color}
      />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      // eslint-disable-next-line react/no-unstable-nested-components
      tabBar={(props) => <TabBarWithMiniPlayer {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Inicio",
          // eslint-disable-next-line react/no-unstable-nested-components
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              focused={focused}
              outlineName="home-outline"
              filledName="home"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Buscar",
          // eslint-disable-next-line react/no-unstable-nested-components
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              focused={focused}
              outlineName="search-outline"
              filledName="search"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Biblioteca",
          // eslint-disable-next-line react/no-unstable-nested-components
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              focused={focused}
              outlineName="library-outline"
              filledName="library"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          // eslint-disable-next-line react/no-unstable-nested-components
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              focused={focused}
              outlineName="person-outline"
              filledName="person"
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
