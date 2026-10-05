/**
 * TrackActionsSheet — hoja global de acciones de una canción (estilo Apple).
 *
 *   menú:      Me gusta · Añadir a playlist · Añadir a la cola · Ir al artista
 *   playlists: mis playlists (y colaborativas) · Nueva playlist
 *
 * Se abre con useTrackMenuStore.open(track). Vive una sola vez en el layout raíz.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Image,
  TextInput,
  Switch,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useAuthStore,
  useLibraryStore,
  usePlayerStore,
  useTrackFavorite,
  useTrackMenuStore,
  getItemArtistName,
  getItemCoverUrl,
  getItemTitle,
  isExternalTrack,
  type PlayableItem,
  type PlaylistSummary,
} from "@vooxie/core";
import { useToastStore } from "./useToastStore";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** Ruta del perfil del artista de una canción, si se puede resolver. */
function artistRoute(track: PlayableItem): string | null {
  if (isExternalTrack(track)) {
    if (track.deezerId != null && /^\d+$/.test(track.artist.externalId)) {
      return `/artist/${encodeURIComponent(`dz:artist:${track.artist.externalId}`)}`;
    }
    return null;
  }
  return track.artist?.id ? `/artist/${track.artist.id}` : null;
}

export function TrackActionsSheet() {
  const router = useRouter();
  const track = useTrackMenuStore((s) => s.track);
  const view = useTrackMenuStore((s) => s.view);
  const close = useTrackMenuStore((s) => s.close);
  const openPlaylists = useTrackMenuStore((s) => s.openPlaylists);
  const session = useAuthStore((s) => s.session);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const toast = useToastStore((s) => s.show);
  const playlists = useLibraryStore((s) => s.playlists);
  const addToPlaylist = useLibraryStore((s) => s.addToPlaylist);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);

  const { isFavorite, toggle: toggleFavorite, canSave } = useTrackFavorite(track);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [collaborative, setCollaborative] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!track) {
      setCreating(false);
      setName("");
      setCollaborative(false);
      setBusy(false);
    }
  }, [track]);

  const requireSession = useCallback((): boolean => {
    if (session) return true;
    close();
    toast("Inicia sesión para usar tu biblioteca.");
    router.push("/(auth)/login");
    return false;
  }, [session, close, toast, router]);

  const onFavorite = useCallback(async () => {
    if (!track || !requireSession()) return;
    const wasFav = isFavorite;
    close();
    const err = await toggleFavorite();
    toast(err ?? (wasFav ? "Quitada de tus me gusta" : "Guardada en tus me gusta"));
  }, [track, requireSession, isFavorite, close, toggleFavorite, toast]);

  const onPickPlaylist = useCallback(
    async (pl: PlaylistSummary) => {
      if (!track || busy) return;
      setBusy(true);
      const res = await addToPlaylist(pl.id, track);
      setBusy(false);
      close();
      toast(!res.ok ? res.message : res.result === "exists" ? `Ya estaba en ${pl.name}` : `Añadida a ${pl.name}`);
    },
    [track, busy, addToPlaylist, close, toast],
  );

  const onCreate = useCallback(async () => {
    if (!track || busy) return;
    setBusy(true);
    const created = await createPlaylist(name, { collaborative });
    if (!created.ok) {
      setBusy(false);
      toast(created.message);
      return;
    }
    const added = await addToPlaylist(created.playlist.id, track);
    setBusy(false);
    close();
    toast(added.ok ? `Añadida a ${created.playlist.name}` : added.message);
  }, [track, busy, name, collaborative, createPlaylist, addToPlaylist, close, toast]);

  if (!track) return null;

  const cover = getItemCoverUrl(track);
  const goArtist = artistRoute(track);

  const actions: { icon: IconName; label: string; onPress: () => void; accent?: boolean; hidden?: boolean }[] = [
    {
      icon: isFavorite ? "heart" : "heart-outline",
      label: isFavorite ? "Quitar de tus me gusta" : "Me gusta",
      accent: isFavorite,
      onPress: onFavorite,
      hidden: !canSave,
    },
    {
      icon: "albums-outline",
      label: "Añadir a playlist",
      onPress: () => {
        if (requireSession()) openPlaylists(track);
      },
      hidden: !canSave,
    },
    {
      icon: "list-outline",
      label: "Añadir a la cola",
      onPress: () => {
        addToQueue(track);
        close();
        toast("Añadida a la cola");
      },
    },
    {
      icon: "person-circle-outline",
      label: "Ir al artista",
      onPress: () => {
        close();
        if (goArtist) router.push(goArtist as never);
      },
      hidden: !goArtist,
    },
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.thumb}>
              {cover ? (
                <Image source={{ uri: cover }} style={styles.thumbImg} />
              ) : (
                <Ionicons name="musical-note" size={20} color="rgba(255,255,255,0.4)" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.title}>{getItemTitle(track)}</Text>
              <Text numberOfLines={1} style={styles.subtitle}>{getItemArtistName(track)}</Text>
            </View>
          </View>
          <View style={styles.divider} />

          {view === "menu" ? (
            actions
              .filter((a) => !a.hidden)
              .map((a) => (
                <Pressable key={a.label} onPress={a.onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                  <Ionicons name={a.icon} size={22} color={a.accent ? "#FF5C8A" : "rgba(255,255,255,0.8)"} />
                  <Text style={[styles.actionLabel, a.accent && { color: "#fff" }]}>{a.label}</Text>
                </Pressable>
              ))
          ) : creating ? (
            <View style={styles.createBox}>
              <Text style={styles.sectionLabel}>Nueva playlist</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Nombre de la playlist"
                placeholderTextColor="rgba(255,255,255,0.35)"
                maxLength={80}
                autoFocus
                style={styles.input}
              />
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionLabel}>Colaborativa</Text>
                  <Text style={styles.hint}>Podrás invitar a otras personas a añadir canciones.</Text>
                </View>
                <Switch value={collaborative} onValueChange={setCollaborative} />
              </View>
              <Pressable
                onPress={onCreate}
                disabled={busy || !name.trim()}
                style={[styles.primary, (busy || !name.trim()) && { opacity: 0.45 }]}
              >
                {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>Crear y añadir</Text>}
              </Pressable>
              <Pressable onPress={() => setCreating(false)} style={styles.secondary}>
                <Text style={styles.secondaryText}>Volver</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              <Pressable onPress={() => setCreating(true)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                <View style={styles.newIcon}>
                  <Ionicons name="add" size={26} color="#fff" />
                </View>
                <Text style={styles.actionLabel}>Nueva playlist</Text>
              </Pressable>
              {playlists.map((pl) => (
                <Pressable key={pl.id} onPress={() => onPickPlaylist(pl)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                  <View style={styles.plThumb}>
                    {pl.covers[0] ? (
                      <Image source={{ uri: pl.covers[0] }} style={styles.thumbImg} />
                    ) : (
                      <Ionicons name="musical-notes" size={20} color="rgba(255,255,255,0.5)" />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.actionLabel}>{pl.name}</Text>
                    <Text style={styles.hint}>
                      {pl.trackCount} {pl.trackCount === 1 ? "canción" : "canciones"}
                      {pl.isCollaborative ? " • Colaborativa" : ""}
                    </Text>
                  </View>
                </Pressable>
              ))}
              {playlists.length === 0 && <Text style={[styles.hint, { padding: 16 }]}>Aún no tienes playlists.</Text>}
            </ScrollView>
          )}
          <View style={{ height: 24 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { backgroundColor: "#12151D", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", marginBottom: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  plThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  title: { color: "#fff", fontSize: 17, fontWeight: "600" },
  subtitle: { color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.12)", marginVertical: 14 },
  action: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderRadius: 12 },
  pressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  actionLabel: { color: "rgba(255,255,255,0.88)", fontSize: 16, fontWeight: "500" },
  hint: { color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 2 },
  newIcon: { width: 48, height: 48, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  createBox: { gap: 14, paddingBottom: 4 },
  sectionLabel: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" },
  input: { color: "#fff", fontSize: 17, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  primary: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#000", fontSize: 16, fontWeight: "700" },
  secondary: { alignItems: "center", paddingVertical: 8 },
  secondaryText: { color: "rgba(255,255,255,0.6)", fontSize: 15 },
});
