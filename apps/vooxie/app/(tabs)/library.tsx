import { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import {
  useTheme,
  spacing,
  typography,
  useSafeSpacing,
  TrackRow,
  EmptyState,
  ErrorState,
  Skeleton,
  SignInPrompt,
} from "@vooxie/ui";
import {
  useAuthStore,
  useFavoritesStore,
  usePlayerStore,
  getItemId,
  getFavoriteTracks,
  type Track,
} from "@vooxie/core";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Track[] };

export default function LibraryScreen() {
  const { theme } = useTheme();
  const { top } = useSafeSpacing();
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const res = await getFavoriteTracks(session.user.id);
    setState(
      res.ok
        ? { status: "ready", data: res.data }
        : { status: "error", message: res.message },
    );
  }, [session]);

  // Se refresca cada vez que se entra a la tab — así refleja favoritos
  // agregados/quitados desde Inicio o Descubrir sin lógica de sync extra.
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setState({ status: "loading" });
      load();
    }, [load, session]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function onToggleFavorite(trackId: string) {
    if (!session) return;
    toggleFavorite(session.user.id, trackId);
    // Quita la fila al instante en vez de esperar al próximo focus.
    setState((prev) =>
      prev.status === "ready"
        ? { status: "ready", data: prev.data.filter((t) => t.id !== trackId) }
        : prev,
    );
  }

  // Explorar sin cuenta (Fase 2 actualizada): Biblioteca necesita sesión
  // de verdad (favoritos son por usuario) — se lo pedimos en vez de
  // mostrar una pantalla rota o vacía sin explicación.
  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <SignInPrompt
          title="Iniciá sesión para ver tu biblioteca"
          description="Ahí vas a encontrar las canciones que guardes como favoritas."
          onSignIn={() => router.push("/(auth)/login")}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={[styles.header, { paddingTop: top }]}>
        <Text style={[styles.title, { color: theme.text }]}>Biblioteca</Text>
      </View>

      {state.status === "loading" ? (
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
              }}
            >
              <Skeleton width={44} height={44} borderRadius={8} />
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Skeleton width="70%" height={13} />
                <Skeleton width="40%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={load} />
      ) : state.data.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="Todavía no tenés favoritos"
          description="Tocá el corazón en cualquier canción para guardarla acá."
        />
      ) : (
        <FlatList
          data={state.data}
          keyExtractor={(t) => t.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
            />
          }
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <TrackRow
              title={item.title}
              artistName={item.artist.display_name}
              coverUrl={item.resolvedCoverUrl}
              durationSeconds={item.duration_seconds}
              isExplicit={item.is_explicit}
              isFavorite={favoriteIds.has(item.id)}
              isActive={!!currentTrack && getItemId(currentTrack) === item.id}
              onPress={() => playTrack(item, state.data)}
              onToggleFavorite={() => onToggleFavorite(item.id)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  title: { ...typography.displayMd },
});
