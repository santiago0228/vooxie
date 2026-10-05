/** Perfil de artista del catálogo oficial (Deezer): foto, fans, populares y discografía. */
import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Image, StyleSheet } from "react-native";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, spacing, typography, useSafeSpacing, ErrorState, Skeleton, EmptyState } from "@vooxie/ui";
import {
  usePlayerStore,
  parseDeezerId,
  getDeezerArtist,
  type DeezerArtistDetail,
} from "@vooxie/core";
import { goBackSafe } from "../navigation";
import { ItemTrackRow } from "../library/ItemTrackRow";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: DeezerArtistDetail };

function fmtFans(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} K`;
  return String(n);
}
const kindLabel = (k?: string) => (k === "ep" ? "EP" : k === "single" ? "Sencillo" : k === "compilation" ? "Recopilación" : "Álbum");

export function DeezerArtistView({ id }: { id: string }) {
  const { theme } = useTheme();
  const { top } = useSafeSpacing();
  const router = useRouter();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    const dz = parseDeezerId(id, "artist");
    if (!dz) return setState({ status: "error", message: "Artista no válido." });
    setState({ status: "loading" });
    try {
      const data = await getDeezerArtist(dz);
      setState(data ? { status: "ready", data } : { status: "error", message: "No encontramos a este artista." });
    } catch {
      setState({ status: "error", message: "No pudimos cargar el perfil. Revisa tu conexión." });
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
          <Skeleton width={120} height={120} borderRadius={60} />
          <Skeleton width={180} height={22} />
        </View>
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }}>
          <View style={styles.header}>
            <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]}>
              {state.data.artist.avatarUrl ? (
                <Image source={{ uri: state.data.artist.avatarUrl }} style={styles.avatarImg} />
              ) : (
                <Ionicons name="person" size={48} color={theme.textSecondary} />
              )}
            </View>
            <Text style={[styles.name, { color: theme.text }]}>{state.data.artist.name}</Text>
            {state.data.artist.followerCount ? (
              <Text style={{ color: theme.textSecondary, ...typography.caption }}>
                {fmtFans(state.data.artist.followerCount)} seguidores
              </Text>
            ) : null}
            {state.data.topTracks.length > 0 && (
              <Pressable
                onPress={() => {
                  playTrack(state.data.topTracks[0], state.data.topTracks);
                  router.push("/player");
                }}
                style={[styles.playBtn, { backgroundColor: theme.accent }]}
              >
                <Ionicons name="play" size={20} color="#fff" />
                <Text style={styles.playText}>Reproducir</Text>
              </Pressable>
            )}
          </View>

          {state.data.topTracks.length === 0 && state.data.albums.length === 0 ? (
            <EmptyState title="Sin contenido" description="Este artista aún no tiene canciones disponibles." />
          ) : null}

          {state.data.topTracks.length > 0 && (
            <>
              <Text style={[styles.section, { color: theme.text }]}>Canciones populares</Text>
              {state.data.topTracks.slice(0, 10).map((t) => (
                <ItemTrackRow key={t.externalId} item={t} queue={state.data.topTracks} />
              ))}
            </>
          )}

          {state.data.albums.length > 0 && (
            <>
              <Text style={[styles.section, { color: theme.text }]}>Discografía</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albums}>
                {state.data.albums.map((a) => (
                  <Pressable key={a.externalId} onPress={() => router.push(`/album/${encodeURIComponent(a.externalId)}`)} style={styles.album}>
                    <View style={[styles.albumCover, { backgroundColor: theme.surfaceElevated }]}>
                      {a.artwork ? <Image source={{ uri: a.artwork.large ?? a.artwork.thumbnail }} style={styles.albumImg} /> : null}
                    </View>
                    <Text numberOfLines={1} style={[styles.albumTitle, { color: theme.text }]}>{a.title}</Text>
                    <Text numberOfLines={1} style={{ color: theme.textSecondary, fontSize: 13 }}>
                      {kindLabel(a.albumType)}{a.releaseDate ? ` • ${a.releaseDate.slice(0, 4)}` : ""}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  header: { alignItems: "center", gap: 8, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  avatar: { width: 128, height: 128, borderRadius: 64, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  avatarImg: { width: "100%", height: "100%" },
  name: { ...typography.displayMd, textAlign: "center" },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999, marginTop: 6 },
  playText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  section: { ...typography.title, paddingHorizontal: spacing.xl, marginTop: spacing.lg, marginBottom: spacing.sm },
  albums: { paddingHorizontal: spacing.xl, gap: 14 },
  album: { width: 140, gap: 4 },
  albumCover: { width: 140, height: 140, borderRadius: 10, overflow: "hidden" },
  albumImg: { width: "100%", height: "100%" },
  albumTitle: { fontSize: 15, fontWeight: "600" },
});
