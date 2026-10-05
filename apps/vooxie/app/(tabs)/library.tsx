/**
 * Biblioteca — playlists (propias y colaborativas) y canciones que te gustan.
 * "Me gusta" junta el catálogo VooXiE (tabla favorites) y las demás fuentes (saved_tracks).
 */
import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
  Image,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useTheme,
  spacing,
  radius,
  typography,
  useSafeSpacing,
  EmptyState,
  ErrorState,
  Skeleton,
  SignInPrompt,
} from "@vooxie/ui";
import {
  useAuthStore,
  useLibraryStore,
  getItemId,
  getFavoriteTracks,
  type PlayableItem,
  type PlaylistSummary,
  type Track,
} from "@vooxie/core";
import { useToastStore } from "../../src/library/useToastStore";
import { ItemTrackRow } from "../../src/library/ItemTrackRow";

type Tab = "playlists" | "likes";
type Likes = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: Track[] };

export default function LibraryScreen() {
  const { theme } = useTheme();
  const { top } = useSafeSpacing();
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const playlists = useLibraryStore((s) => s.playlists);
  const saved = useLibraryStore((s) => s.saved);
  const libLoaded = useLibraryStore((s) => s.loaded);
  const refreshPlaylists = useLibraryStore((s) => s.refreshPlaylists);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const toast = useToastStore((s) => s.show);

  const [tab, setTab] = useState<Tab>("playlists");
  const [likes, setLikes] = useState<Likes>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [collab, setCollab] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadLikes = useCallback(async () => {
    if (!session) return;
    const res = await getFavoriteTracks(session.user.id);
    setLikes(res.ok ? { status: "ready", data: res.data } : { status: "error", message: res.message });
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      loadLikes();
      refreshPlaylists();
    }, [session, loadLikes, refreshPlaylists]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([loadLikes(), refreshPlaylists()]);
    setRefreshing(false);
  }

  // Me gusta = favoritos VooXiE (con audio propio) + guardadas de otras fuentes, lo más reciente primero.
  const likedItems: PlayableItem[] = useMemo(() => {
    const vx: PlayableItem[] = likes.status === "ready" ? likes.data : [];
    const seen = new Set(vx.map((t) => getItemId(t)));
    const rest = saved.map((s) => s.item).filter((i) => !seen.has(getItemId(i)));
    return [...rest, ...vx];
  }, [likes, saved]);

  async function onCreate() {
    if (busy) return;
    setBusy(true);
    const res = await createPlaylist(name, { collaborative: collab });
    setBusy(false);
    if (!res.ok) {
      toast(res.message);
      return;
    }
    setCreating(false);
    setName("");
    setCollab(false);
    router.push(`/playlist/${res.playlist.id}`);
  }

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <SignInPrompt
          title="Inicia sesión para ver tu biblioteca"
          description="Ahí encontrarás tus playlists y las canciones que te gustan."
          onSignIn={() => router.push("/(auth)/login")}
        />
      </View>
    );
  }

  const renderPlaylist = (pl: PlaylistSummary) => (
    <Pressable key={pl.id} onPress={() => router.push(`/playlist/${pl.id}`)} style={({ pressed }) => [styles.plRow, pressed && { opacity: 0.7 }]}>
      <View style={[styles.plCover, { backgroundColor: theme.surfaceElevated }]}>
        {pl.covers.length >= 4 ? (
          pl.covers.slice(0, 4).map((c) => <Image key={c} source={{ uri: c }} style={styles.plCell} />)
        ) : pl.covers[0] ? (
          <Image source={{ uri: pl.covers[0] }} style={styles.plFull} />
        ) : (
          <Ionicons name="musical-notes" size={26} color={theme.textSecondary} />
        )}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={1} style={[styles.plName, { color: theme.text }]}>{pl.name}</Text>
        <Text numberOfLines={1} style={[styles.plMeta, { color: theme.textSecondary }]}>
          Playlist • {pl.trackCount} {pl.trackCount === 1 ? "canción" : "canciones"}
          {pl.isCollaborative ? " • Colaborativa" : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={[styles.header, { paddingTop: top }]}>
        <Text style={[styles.title, { color: theme.text }]}>Biblioteca</Text>
        <Pressable onPress={() => setCreating(true)} hitSlop={10} style={[styles.addBtn, { backgroundColor: theme.surfaceElevated }]}>
          <Ionicons name="add" size={24} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {([["playlists", "Playlists"], ["likes", "Me gusta"]] as const).map(([id, label]) => {
          const on = tab === id;
          return (
            <Pressable
              key={id}
              onPress={() => setTab(id)}
              style={[styles.tab, { backgroundColor: on ? theme.accent : theme.surfaceElevated, borderColor: on ? theme.accent : theme.border }]}
            >
              <Text style={{ color: on ? "#fff" : theme.text, fontWeight: "600", fontSize: 14 }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }}
      >
        {tab === "playlists" ? (
          !libLoaded ? (
            <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
                  <Skeleton width={64} height={64} borderRadius={8} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skeleton width="60%" height={14} />
                    <Skeleton width="35%" height={11} />
                  </View>
                </View>
              ))}
            </View>
          ) : playlists.length === 0 ? (
            <EmptyState
              icon="albums-outline"
              title="Crea tu primera playlist"
              description='Toca "+" para crear una, o "···" en una canción y "Añadir a playlist". Puedes hacerlas colaborativas.'
            />
          ) : (
            <View style={{ paddingHorizontal: spacing.xl }}>{playlists.map(renderPlaylist)}</View>
          )
        ) : likes.status === "loading" && likedItems.length === 0 ? (
          <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} width="100%" height={52} borderRadius={8} />)}
          </View>
        ) : likes.status === "error" && likedItems.length === 0 ? (
          <ErrorState message={likes.message} onRetry={loadLikes} />
        ) : likedItems.length === 0 ? (
          <EmptyState icon="heart-outline" title="Todavía no tienes me gusta" description="Toca el corazón en cualquier canción para guardarla aquí." />
        ) : (
          likedItems.map((item) => <ItemTrackRow key={getItemId(item)} item={item} queue={likedItems} />)
        )}
      </ScrollView>

      {/* Nueva playlist */}
      <Modal visible={creating} transparent animationType="slide" onRequestClose={() => setCreating(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCreating(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Nueva playlist</Text>
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
                <Text style={styles.switchLabel}>Colaborativa</Text>
                <Text style={styles.switchHint}>Invita a otras personas a añadir canciones.</Text>
              </View>
              <Switch value={collab} onValueChange={setCollab} />
            </View>
            <Pressable onPress={onCreate} disabled={busy || !name.trim()} style={[styles.create, (busy || !name.trim()) && { opacity: 0.45 }]}>
              {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.createText}>Crear</Text>}
            </Pressable>
            <View style={{ height: 24 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { ...typography.displayMd },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  tab: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  plRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8 },
  plCover: { width: 64, height: 64, borderRadius: 8, overflow: "hidden", flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center" },
  plCell: { width: 32, height: 32 },
  plFull: { width: 64, height: 64 },
  plName: { fontSize: 16, fontWeight: "600" },
  plMeta: { fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { backgroundColor: "#12151D", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, gap: 14 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  sheetTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  input: { color: "#fff", fontSize: 17, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  switchLabel: { color: "rgba(255,255,255,0.9)", fontSize: 16, fontWeight: "500" },
  switchHint: { color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 2 },
  create: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  createText: { color: "#000", fontSize: 16, fontWeight: "700" },
});
