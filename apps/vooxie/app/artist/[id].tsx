import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { goBackSafe } from "../../src/navigation";
import { DeezerArtistView } from "../../src/catalog/DeezerArtistView";
import { Ionicons } from "@expo/vector-icons";
import {
  useTheme,
  spacing,
  typography,
  useSafeSpacing,
  SectionHeader,
  TrackRow,
  AlbumCard,
  ErrorState,
  Skeleton,
  EmptyState,
} from "@vooxie/ui";
import {
  useAuthStore,
  useFavoritesStore,
  usePlayerStore,
  getItemId,
  getArtistDetail,
  getPlayableId,
  type ArtistDetail,
} from "@vooxie/core";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ArtistDetail };

function VooxieArtistScreen() {
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
    const res = await getArtistDetail(id);
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
          <Skeleton width={96} height={96} borderRadius={48} />
          <Skeleton width={160} height={20} />
        </View>
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
          <View style={styles.header}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: theme.surfaceElevated },
              ]}
            >
              {state.data.avatar_url ? (
                <Image
                  source={{ uri: state.data.avatar_url }}
                  style={styles.avatarImage}
                />
              ) : (
                <Ionicons name="person" size={40} color={theme.textSecondary} />
              )}
            </View>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: theme.text }]}>
                {state.data.display_name}
              </Text>
              {state.data.verified ? (
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={theme.accent}
                />
              ) : null}
            </View>
            {state.data.monthly_listeners ? (
              <Text style={[styles.listeners, { color: theme.textSecondary }]}>
                {formatListeners(state.data.monthly_listeners)} oyentes
              </Text>
            ) : null}
            {state.data.bio ? (
              <Text style={[styles.bio, { color: theme.textSecondary }]}>
                {state.data.bio}
              </Text>
            ) : null}
          </View>

          <View style={{ height: spacing.lg }} />

          {state.data.latest.length > 0 && state.data.latest[0].release_date ? (
            <>
              <SectionHeader title="Lanzamientos recientes" />
              {state.data.latest.slice(0, 3).map((track) => (
                <TrackRow
                  key={`latest-${track.id}`}
                  title={track.title}
                  artistName={state.data.display_name}
                  coverUrl={track.resolvedCoverUrl}
                  durationSeconds={track.duration_seconds}
                  isExplicit={track.is_explicit}
                  isFavorite={favoriteIds.has(track.id)}
                  isActive={!!currentTrack && getItemId(currentTrack) === getPlayableId(track)}
                  onPress={() => playTrack(track, state.data.latest)}
                  onToggleFavorite={() => onToggleFavorite(track.id)}
                />
              ))}
              <View style={{ height: spacing.lg }} />
            </>
          ) : null}

          <SectionHeader title="Canciones populares" />
          {state.data.tracks.length === 0 ? (
            <EmptyState title="Todavía no publicó canciones" />
          ) : (
            state.data.tracks.map((track) => (
              <TrackRow
                key={track.id}
                title={track.title}
                artistName={state.data.display_name}
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

          <View style={{ height: spacing.lg }} />

          <SectionHeader title="Discografía" />
          {state.data.albums.length === 0 ? (
            <EmptyState
              title="Todavía no publicó álbumes"
              icon="disc-outline"
            />
          ) : (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={state.data.albums}
              keyExtractor={(al) => al.id}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item }) => (
                <AlbumCard
                  title={item.title}
                  artistName={`${albumTypeLabel(item.album_type)}${item.release_date ? ` · ${item.release_date.slice(0, 4)}` : ""}`}
                  coverUrl={item.cover_url}
                  onPress={() => router.push(`/album/${item.id}`)}
                />
              )}
            />
          )}

          {state.data.collaborations.length > 0 ? (
            <>
              <View style={{ height: spacing.lg }} />
              <SectionHeader title="Colaboraciones" />
              {state.data.collaborations.map((track) => (
                <TrackRow
                  key={`collab-${track.id}`}
                  title={track.title}
                  artistName={track.artist.display_name}
                  coverUrl={track.resolvedCoverUrl}
                  durationSeconds={track.duration_seconds}
                  isExplicit={track.is_explicit}
                  isFavorite={favoriteIds.has(track.id)}
                  isActive={!!currentTrack && getItemId(currentTrack) === getPlayableId(track)}
                  onPress={() => playTrack(track, state.data.collaborations)}
                  onToggleFavorite={() => onToggleFavorite(track.id)}
                />
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function albumTypeLabel(type: string): string {
  switch (type) {
    case "ep": return "EP";
    case "single": return "Sencillo";
    case "compilation": return "Recopilación";
    default: return "Álbum";
  }
}

function formatListeners(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} K`;
  return String(n);
}

const styles = StyleSheet.create({
  listeners: { ...typography.caption },
  topBar: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  header: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  name: { ...typography.displayMd, textAlign: "center" },
  bio: { ...typography.body, textAlign: "center" },
  horizontalList: { paddingHorizontal: spacing.xl, gap: spacing.md },
});

/** Ruta única: ids "dz:…" vienen del catálogo oficial (Deezer); el resto, del catálogo VooXiE. */
export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  let ref = typeof id === "string" ? id : "";
  try {
    ref = decodeURIComponent(ref); // por si el router entrega el id aún codificado ("dz%3A…")
  } catch {
    /* id con % suelto: se usa tal cual */
  }
  if (ref.startsWith("dz:")) return <DeezerArtistView id={ref} />;
  return <VooxieArtistScreen />;
}
