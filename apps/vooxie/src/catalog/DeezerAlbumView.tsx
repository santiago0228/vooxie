/** Álbum / EP / sencillo del catálogo oficial (Deezer): portada, año y canciones en orden. */
import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Image, StyleSheet } from "react-native";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, spacing, typography, useSafeSpacing, ErrorState, Skeleton, EmptyState } from "@vooxie/ui";
import { usePlayerStore, parseDeezerId, getDeezerAlbum, type DeezerAlbumDetail } from "@vooxie/core";
import { goBackSafe } from "../navigation";
import { ItemTrackRow } from "../library/ItemTrackRow";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: DeezerAlbumDetail };
const kindLabel = (k?: string) => (k === "ep" ? "EP" : k === "single" ? "Sencillo" : k === "compilation" ? "Recopilación" : "Álbum");

export function DeezerAlbumView({ id }: { id: string }) {
  const { theme } = useTheme();
  const { top } = useSafeSpacing();
  const router = useRouter();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    const dz = parseDeezerId(id, "album");
    if (!dz) return setState({ status: "error", message: "Álbum no válido." });
    setState({ status: "loading" });
    try {
      const data = await getDeezerAlbum(dz);
      setState(data ? { status: "ready", data } : { status: "error", message: "No encontramos este álbum." });
    } catch {
      setState({ status: "error", message: "No pudimos cargar el álbum. Revisa tu conexión." });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: top }]}>
        <Pressable onPress={() => goBackSafe(router)} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
      </View>

      {state.status === "loading" ? (
        <View style={{ padding: spacing.xl, alignItems: "center", gap: spacing.md }}>
          <Skeleton width={220} height={220} borderRadius={12} />
          <Skeleton width={180} height={22} />
        </View>
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }}>
          <View style={styles.header}>
            <View style={[styles.cover, { backgroundColor: theme.surfaceElevated }]}>
              {state.data.album.artwork ? (
                <Image source={{ uri: state.data.album.artwork.large ?? state.data.album.artwork.thumbnail }} style={styles.coverImg} />
              ) : null}
            </View>
            <Text style={[styles.title, { color: theme.text }]}>{state.data.album.title}</Text>
            <Pressable onPress={() => router.push(`/artist/${encodeURIComponent(`dz:artist:${state.data.album.artist.externalId}`)}`)}>
              <Text style={{ color: theme.accent, fontSize: 16, fontWeight: "600" }}>{state.data.album.artist.name}</Text>
            </Pressable>
            <Text style={{ color: theme.textSecondary, ...typography.caption }}>
              {kindLabel(state.data.album.albumType)}
              {state.data.album.releaseDate ? ` • ${state.data.album.releaseDate.slice(0, 4)}` : ""}
              {` • ${state.data.tracks.length} ${state.data.tracks.length === 1 ? "canción" : "canciones"}`}
            </Text>
            {state.data.tracks.length > 0 && (
              <Pressable
                onPress={() => {
                  playTrack(state.data.tracks[0], state.data.tracks);
                  router.push("/player");
                }}
                style={[styles.playBtn, { backgroundColor: theme.accent }]}
              >
                <Ionicons name="play" size={20} color="#fff" />
                <Text style={styles.playText}>Reproducir</Text>
              </Pressable>
            )}
          </View>

          {state.data.tracks.length === 0 ? (
            <EmptyState title="Sin canciones" description="Este álbum no tiene canciones disponibles." />
          ) : (
            state.data.tracks.map((t) => <ItemTrackRow key={t.externalId} item={t} queue={state.data.tracks} />)
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  header: { alignItems: "center", gap: 6, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  cover: { width: 230, height: 230, borderRadius: 12, overflow: "hidden", marginBottom: 8 },
  coverImg: { width: "100%", height: "100%" },
  title: { ...typography.displayMd, textAlign: "center" },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999, marginTop: 8 },
  playText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
