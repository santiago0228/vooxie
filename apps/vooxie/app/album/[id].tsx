import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { goBackSafe } from "../../src/navigation";
import { DeezerAlbumView } from "../../src/catalog/DeezerAlbumView";
import { Ionicons } from "@expo/vector-icons";
import {
  useTheme,
  spacing,
  radius,
  typography,
  useSafeSpacing,
  TrackRow,
  ErrorState,
  Skeleton,
  EmptyState,
} from "@vooxie/ui";
import {
  useAuthStore,
  useFavoritesStore,
  usePlayerStore,
  getItemId,
  getPlayableId,
  getAlbumDetail,
  type AlbumDetail,
} from "@vooxie/core";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AlbumDetail };

function formatReleaseDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return date.toLocaleDateString("es", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function VooxieAlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { top } = useSafeSpacing();
  const router = useRouter();

  const session = useAuthStore((s) => s.session);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    if (!id) return;
    setState({ status: "loading" });
    const res = await getAlbumDetail(id);
    setState(
      res.ok
        ? { status: "ready", data: res.data }
        : { status: "error", message: res.message },
    );
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function onToggleFavorite(trackId: string) {
    if (!session) {
      router.push("/(auth)/login");
      return;
    }
    toggleFavorite(session.user.id, trackId);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topBar, { paddingTop: top }]}>
        <Pressable onPress={() => goBackSafe(router)} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
      </View>

      {state.status === "loading" ? (
        <View
          style={{ padding: spacing.xl, alignItems: "center", gap: spacing.md }}
        >
          <Skeleton width={200} height={200} borderRadius={radius.md} />
          <Skeleton width={160} height={20} />
        </View>
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
          <View style={styles.header}>
            <View
              style={[styles.cover, { backgroundColor: theme.surfaceElevated }]}
            >
              {state.data.cover_url ? (
                <Image
                  source={{ uri: state.data.cover_url }}
                  style={styles.coverImage}
                />
              ) : (
                <Ionicons
                  name="disc-outline"
                  size={48}
                  color={theme.textSecondary}
                />
              )}
            </View>
            <Text style={[styles.title, { color: theme.text }]}>
              {state.data.title}
            </Text>
            <Pressable
              onPress={() => router.push(`/artist/${state.data.artist.id}`)}
            >
              <Text style={[styles.artist, { color: theme.accent }]}>
                {state.data.artist.display_name}
              </Text>
            </Pressable>
            {formatReleaseDate(state.data.release_date) ? (
              <Text style={[styles.meta, { color: theme.textSecondary }]}>
                {formatReleaseDate(state.data.release_date)} ·{" "}
                {state.data.tracks.length}{" "}
                {state.data.tracks.length === 1 ? "canción" : "canciones"}
              </Text>
            ) : null}
          </View>

          <View style={{ height: spacing.lg }} />

          {state.data.tracks.length === 0 ? (
            <EmptyState title="Este álbum todavía no tiene canciones" />
          ) : (
            state.data.tracks.map((track) => (
              <TrackRow
                key={track.id}
                title={track.title}
                artistName={state.data.artist.display_name}
                coverUrl={track.resolvedCoverUrl}
                durationSeconds={track.duration_seconds}
                isExplicit={track.is_explicit}
                isFavorite={favoriteIds.has(track.id)}
                isActive={!!currentTrack && getItemId(currentTrack) === getPlayableId(track)}
                onPress={() => playTrack(track, state.data.tracks)}
                onToggleFavorite={() => onToggleFavorite(track.id)}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  header: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
  },
  cover: {
    width: 200,
    height: 200,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  coverImage: { width: "100%", height: "100%" },
  title: { ...typography.displayMd, textAlign: "center" },
  artist: { ...typography.bodyStrong },
  meta: { ...typography.caption },
});

/** Ruta única: ids "dz:…" vienen del catálogo oficial (Deezer); el resto, del catálogo VooXiE. */
export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  let ref = typeof id === "string" ? id : "";
  try {
    ref = decodeURIComponent(ref); // por si el router entrega el id aún codificado ("dz%3A…")
  } catch {
    /* id con % suelto: se usa tal cual */
  }
  if (ref.startsWith("dz:")) return <DeezerAlbumView id={ref} />;
  return <VooxieAlbumScreen />;
}
