import { useEffect, useRef } from "react";
import { Tabs, useRouter } from "expo-router";
import { View, Animated, type ColorValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomTabBar, type BottomTabBarProps } from "expo-router/tabs";
import { useTheme, MiniPlayer, MiniProgressBar } from "@vooxie/ui";
import { OutputRouteButton } from "../../src/player/OutputRouteButton";
import {
  usePlayerStore,
  getItemTitle,
  getItemArtistName,
  getItemCoverUrl,
  type PlayerState,
} from "@vooxie/core";
import { coverZoomFor } from "@vooxie/core";

/**
 * Barra de progreso: es el ÚNICO componente que se suscribe a la posición (cambia cada ~0.5 s),
 * así el avance de la canción no re-renderiza el mini-reproductor ni la barra de pestañas
 * (antes eso causaba tirones al cambiar de pestaña mientras sonaba música).
 */
function MiniProgress() {
  const position = usePlayerStore((s: PlayerState) => s.positionSeconds);
  const duration = usePlayerStore((s: PlayerState) => s.durationSeconds);
  return <MiniProgressBar progress={duration > 0 ? position / duration : 0} />;
}

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
  const togglePlayPause = usePlayerStore((s: PlayerState) => s.togglePlayPause);

  const { theme } = useTheme();
  const coverUrl = currentTrack ? getItemCoverUrl(currentTrack) : null;

  return (
    // Fondo sólido del tema: el área alrededor del mini-reproductor nunca se ve blanca.
    <View style={{ backgroundColor: theme.surface }}>
      {currentTrack ? (
        <MiniPlayer
          title={getItemTitle(currentTrack)}
          artistName={getItemArtistName(currentTrack)}
          coverUrl={getItemCoverUrl(currentTrack)}
          isPlaying={status === "playing"}
          isLoading={status === "loading"}
          progress={<MiniProgress />}
          accessory={<OutputRouteButton size={26} />}
          coverZoom={coverZoomFor(coverUrl)}
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
