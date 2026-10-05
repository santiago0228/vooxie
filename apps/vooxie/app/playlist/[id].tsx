/**
 * Playlist — canciones, colaboradores e invitaciones.
 *  · Dueño: renombrar, invitar por @usuario, hacerla colaborativa/pública, borrar.
 *  · Colaborador: añadir/quitar canciones, salir de la playlist.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, spacing, typography, useSafeSpacing, ErrorState, Skeleton, EmptyState } from "@vooxie/ui";
import {
  useAuthStore,
  useLibraryStore,
  usePlayerStore,
  useTrackMenuStore,
  getPlaylist,
  updatePlaylist,
  deletePlaylist,
  removeFromPlaylist,
  inviteToPlaylist,
  removeMember,
  getItemId,
  getItemTitle,
  getItemArtistName,
  getItemCoverUrl,
  type PlaylistDetail,
} from "@vooxie/core";
import { goBackSafe } from "../../src/navigation";
import { useToastStore } from "../../src/library/useToastStore";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: PlaylistDetail };

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { top } = useSafeSpacing();
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const refreshPlaylists = useLibraryStore((s) => s.refreshPlaylists);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const openMenu = useTrackMenuStore((s) => s.open);
  const toast = useToastStore((s) => s.show);

  const [state, setState] = useState<State>({ status: "loading" });
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const res = await getPlaylist(id);
    setState(res.ok ? { status: "ready", data: res.data } : { status: "error", message: res.message });
  }, [id]);

  useEffect(() => {
    setState({ status: "loading" });
    load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <View style={[styles.root, { backgroundColor: theme.background, paddingTop: top + 56 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ padding: spacing.xl, gap: spacing.md }}>
          <Skeleton width={180} height={26} />
          <Skeleton width={120} height={14} />
        </View>
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <View style={[styles.root, { backgroundColor: theme.background, paddingTop: top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Pressable onPress={() => goBackSafe(router)} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <ErrorState message={state.message} onRetry={load} />
      </View>
    );
  }

  const pl = state.data;
  const uid = session?.user.id ?? null;
  const isOwner = uid === pl.ownerId;
  const canEdit = isOwner || (pl.isCollaborative && pl.members.some((m) => m.userId === uid));
  const items = pl.items.map((r) => r.item);
  const ownerName = pl.members.find((m) => m.userId === pl.ownerId)?.username ?? "";

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) toast(res.message ?? "No pudimos completar la acción.");
    else after?.();
  };

  const onInvite = () =>
    run(
      () => inviteToPlaylist(pl.id, invite),
      async () => {
        setInvite("");
        toast("Invitación enviada");
        await load();
        refreshPlaylists();
      },
    );

  const onDelete = () =>
    Alert.alert("Borrar playlist", `Se borrará "${pl.name}" para todos.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: () =>
          run(() => deletePlaylist(pl.id), () => {
            refreshPlaylists();
            goBackSafe(router);
          }),
      },
    ]);

  const onLeave = () =>
    run(() => removeMember(pl.id, uid as string), () => {
      refreshPlaylists();
      goBackSafe(router);
    });

  const onRename = () =>
    run(
      () => updatePlaylist(pl.id, { name: draftName }),
      async () => {
        setEditing(false);
        await load();
        refreshPlaylists();
      },
    );

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: top }]}>
        <Pressable onPress={() => goBackSafe(router)} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        {isOwner && (
          <Pressable onPress={onDelete} hitSlop={12}>
            <Ionicons name="trash-outline" size={22} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }} keyboardShouldPersistTaps="handled">
        {/* Cabecera */}
        <View style={styles.header}>
          <View style={[styles.mosaic, { backgroundColor: theme.surfaceElevated }]}>
            {pl.covers.length >= 4 ? (
              pl.covers.slice(0, 4).map((c) => <Image key={c} source={{ uri: c }} style={styles.mosaicCell} />)
            ) : pl.covers[0] ? (
              <Image source={{ uri: pl.covers[0] }} style={styles.mosaicFull} />
            ) : (
              <Ionicons name="musical-notes" size={44} color={theme.textSecondary} />
            )}
          </View>

          {editing ? (
            <View style={styles.renameRow}>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                maxLength={80}
                autoFocus
                style={[styles.renameInput, { color: theme.text, borderColor: theme.border }]}
              />
              <Pressable onPress={onRename} disabled={busy || !draftName.trim()}>
                <Ionicons name="checkmark-circle" size={30} color={theme.accent} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              disabled={!isOwner}
              onPress={() => {
                setDraftName(pl.name);
                setEditing(true);
              }}
            >
              <Text style={[styles.name, { color: theme.text }]}>{pl.name}</Text>
            </Pressable>
          )}
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {ownerName ? `@${ownerName} • ` : ""}
            {pl.items.length} {pl.items.length === 1 ? "canción" : "canciones"}
            {pl.isCollaborative ? ` • Colaborativa (${pl.members.length})` : ""}
          </Text>

          <View style={styles.actions}>
            <Pressable
              disabled={items.length === 0}
              onPress={() => {
                playTrack(items[0], items);
                router.push("/player");
              }}
              style={[styles.playBtn, { backgroundColor: theme.accent, opacity: items.length ? 1 : 0.4 }]}
            >
              <Ionicons name="play" size={20} color="#fff" />
              <Text style={styles.playText}>Reproducir</Text>
            </Pressable>
            {!isOwner && uid && (
              <Pressable onPress={onLeave} style={[styles.ghostBtn, { borderColor: theme.border }]}>
                <Text style={{ color: theme.text, fontWeight: "600" }}>Salir</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Canciones */}
        {pl.items.length === 0 ? (
          <EmptyState
            icon="musical-notes-outline"
            title="Playlist vacía"
            description={canEdit ? 'Toca "···" en cualquier canción y elige "Añadir a playlist".' : "Todavía no hay canciones."}
          />
        ) : (
          pl.items.map((row) => {
            const active = !!currentTrack && getItemId(currentTrack) === getItemId(row.item);
            const cover = getItemCoverUrl(row.item);
            return (
              <Pressable
                key={row.id}
                onPress={() => {
                  playTrack(row.item, items);
                  router.push("/player");
                }}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.rowCover, { backgroundColor: theme.surfaceElevated }]}>
                  {cover ? <Image source={{ uri: cover }} style={styles.rowCoverImg} /> : <Ionicons name="musical-note" size={18} color={theme.textSecondary} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[styles.rowTitle, { color: active ? theme.accent : theme.text }]}>
                    {getItemTitle(row.item)}
                  </Text>
                  <Text numberOfLines={1} style={[styles.rowSub, { color: theme.textSecondary }]}>
                    {getItemArtistName(row.item)}
                  </Text>
                </View>
                <Pressable onPress={() => openMenu(row.item)} hitSlop={10} style={styles.rowBtn}>
                  <Ionicons name="ellipsis-horizontal" size={18} color={theme.textSecondary} />
                </Pressable>
                {canEdit && (
                  <Pressable
                    hitSlop={10}
                    style={styles.rowBtn}
                    onPress={() =>
                      run(() => removeFromPlaylist(row.id), async () => {
                        await load();
                        refreshPlaylists();
                      })
                    }
                  >
                    <Ionicons name="remove-circle-outline" size={20} color={theme.textSecondary} />
                  </Pressable>
                )}
              </Pressable>
            );
          })
        )}

        {/* Colaboradores */}
        {(isOwner || pl.isCollaborative) && (
          <View style={styles.collab}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Colaboradores</Text>
            {pl.members.map((m) => (
              <View key={m.userId} style={styles.memberRow}>
                <Ionicons name="person-circle-outline" size={26} color={theme.textSecondary} />
                <Text style={[styles.memberName, { color: theme.text }]}>
                  @{m.username}
                  {m.userId === pl.ownerId ? "  · dueño" : ""}
                </Text>
                {isOwner && m.userId !== pl.ownerId && (
                  <Pressable
                    hitSlop={10}
                    onPress={() => run(() => removeMember(pl.id, m.userId), async () => { await load(); refreshPlaylists(); })}
                  >
                    <Ionicons name="close" size={18} color={theme.textSecondary} />
                  </Pressable>
                )}
              </View>
            ))}
            {isOwner && (
              <View style={styles.inviteRow}>
                <TextInput
                  value={invite}
                  onChangeText={setInvite}
                  placeholder="Invitar por @usuario"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.inviteInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
                />
                <Pressable
                  onPress={onInvite}
                  disabled={busy || !invite.trim()}
                  style={[styles.inviteBtn, { backgroundColor: theme.accent, opacity: busy || !invite.trim() ? 0.45 : 1 }]}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.inviteText}>Invitar</Text>}
                </Pressable>
              </View>
            )}
            {isOwner && !pl.isCollaborative && (
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                Al invitar a alguien, la playlist pasa a ser colaborativa.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  back: { padding: spacing.xl },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  header: { alignItems: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: 8 },
  mosaic: { width: 190, height: 190, borderRadius: 14, overflow: "hidden", flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center" },
  mosaicCell: { width: 95, height: 95 },
  mosaicFull: { width: 190, height: 190 },
  name: { ...typography.displayMd, textAlign: "center", marginTop: 8 },
  renameRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, alignSelf: "stretch" },
  renameInput: { flex: 1, borderBottomWidth: 1, fontSize: 24, fontWeight: "700", paddingVertical: 6 },
  meta: { ...typography.caption, textAlign: "center" },
  actions: { flexDirection: "row", gap: 12, marginTop: 10 },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 26, paddingVertical: 12, borderRadius: 999 },
  playText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  ghostBtn: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: spacing.xl, paddingVertical: 8 },
  rowCover: { width: 52, height: 52, borderRadius: 8, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  rowCoverImg: { width: "100%", height: "100%" },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowSub: { fontSize: 14, marginTop: 2 },
  rowBtn: { paddingHorizontal: 6, paddingVertical: 8 },
  collab: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: 10 },
  sectionTitle: { ...typography.title },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  memberName: { flex: 1, fontSize: 15 },
  inviteRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  inviteInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  inviteBtn: { borderRadius: 12, paddingHorizontal: 18, justifyContent: "center" },
  inviteText: { color: "#fff", fontWeight: "700" },
  hint: { fontSize: 13 },
});
