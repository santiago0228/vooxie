/**
 * Biblioteca del usuario: me gusta de cualquier fuente y playlists (privadas, públicas, colaborativas).
 * Todo pasa por RLS: la app solo puede tocar lo que le corresponde.
 */
import { supabase } from "../supabase/client";
import type { Database } from "../supabase/types.generated";
import type { PlayableItem } from "../player/PlayableItem";
import { fromSnapshot, toSnapshot, trackKeyOf, type TrackSnapshot } from "./trackSnapshot";

export type LibResult<T> = { ok: true; data: T } | { ok: false; message: string };

const fail = (where: string, error: { message?: string; code?: string } | null, friendly: string): { ok: false; message: string } => {
  console.warn(`[library] ${where}:`, error?.code ?? "", error?.message ?? "");
  return { ok: false, message: friendly };
};

export type SavedTrack = { key: string; item: PlayableItem; savedAt: string };

export type PlaylistSummary = {
  id: string;
  name: string;
  ownerId: string;
  isPublic: boolean;
  isCollaborative: boolean;
  coverUrl: string | null;
  trackCount: number;
  memberCount: number;
  updatedAt: string;
  /** Primeras portadas para el mosaico. */
  covers: string[];
};

export type PlaylistItemRow = { id: string; key: string; item: PlayableItem; addedBy: string; addedAt: string };
export type PlaylistMember = { userId: string; username: string };
export type PlaylistDetail = PlaylistSummary & {
  description: string | null;
  items: PlaylistItemRow[];
  members: PlaylistMember[];
};

// ─── Me gusta (fuentes externas) ─────────────────────────────────────────────

export async function listSavedTracks(userId: string): Promise<LibResult<SavedTrack[]>> {
  const { data, error } = await supabase
    .from("saved_tracks")
    .select("track_key,snapshot,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return fail("listSavedTracks", error, "No pudimos cargar tus canciones guardadas.");
  const out: SavedTrack[] = [];
  for (const row of data ?? []) {
    const item = fromSnapshot(row.snapshot);
    if (item) out.push({ key: row.track_key, item, savedAt: row.created_at });
  }
  return { ok: true, data: out };
}

export async function saveTrack(userId: string, item: PlayableItem): Promise<LibResult<string>> {
  const key = trackKeyOf(item);
  if (!key) return { ok: false, message: "Esta canción no se puede guardar." };
  const { error } = await supabase
    .from("saved_tracks")
    .insert({ user_id: userId, track_key: key, snapshot: toSnapshot(item) as TrackSnapshot });
  // 23505 = ya estaba guardada: es lo que el usuario quería.
  if (error && error.code !== "23505") return fail("saveTrack", error, "No pudimos guardar la canción.");
  return { ok: true, data: key };
}

export async function unsaveTrack(userId: string, key: string): Promise<LibResult<true>> {
  const { error } = await supabase.from("saved_tracks").delete().eq("user_id", userId).eq("track_key", key);
  if (error) return fail("unsaveTrack", error, "No pudimos quitar la canción.");
  return { ok: true, data: true };
}

// ─── Playlists ───────────────────────────────────────────────────────────────

type PlaylistRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  is_public: boolean;
  is_collaborative: boolean;
  updated_at: string;
};

function summarize(
  p: PlaylistRow,
  items: { snapshot: unknown }[],
  count: number,
  memberCount: number,
): PlaylistSummary {
  const covers: string[] = [];
  for (const it of items) {
    const item = fromSnapshot(it.snapshot);
    if (!item) continue;
    const c = "externalId" in item ? item.artwork?.large ?? item.artwork?.thumbnail : item.resolvedCoverUrl;
    if (c && !covers.includes(c)) covers.push(c);
    if (covers.length === 4) break;
  }
  return {
    id: p.id,
    name: p.name,
    ownerId: p.owner_id,
    isPublic: p.is_public,
    isCollaborative: p.is_collaborative,
    coverUrl: p.cover_url,
    trackCount: count,
    memberCount,
    updatedAt: p.updated_at,
    covers,
  };
}

/** Mis playlists + las colaborativas en las que participo. */
export async function listMyPlaylists(userId: string): Promise<LibResult<PlaylistSummary[]>> {
  const { data, error } = await supabase
    .from("playlists")
    .select(
      "id,owner_id,name,description,cover_url,is_public,is_collaborative,updated_at," +
        "playlist_members(user_id),playlist_items(snapshot,position)",
    )
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return fail("listMyPlaylists", error, "No pudimos cargar tus playlists.");

  type Row = PlaylistRow & {
    playlist_members: { user_id: string }[];
    playlist_items: { snapshot: unknown; position: number }[];
  };
  const rows = (data ?? []) as unknown as Row[];
  const mine = rows.filter((r) => r.owner_id === userId || r.playlist_members.some((m) => m.user_id === userId));
  return {
    ok: true,
    data: mine.map((r) => {
      const items = [...r.playlist_items].sort((a, b) => a.position - b.position);
      return summarize(r, items.slice(0, 8), items.length, r.playlist_members.length);
    }),
  };
}

export async function createPlaylist(
  userId: string,
  name: string,
  options: { collaborative?: boolean; isPublic?: boolean } = {},
): Promise<LibResult<PlaylistSummary>> {
  const clean = name.trim().slice(0, 80);
  if (!clean) return { ok: false, message: "Ponle un nombre a la playlist." };
  const { data, error } = await supabase
    .from("playlists")
    .insert({
      owner_id: userId,
      name: clean,
      is_collaborative: options.collaborative ?? false,
      is_public: options.isPublic ?? false,
    })
    .select("id,owner_id,name,description,cover_url,is_public,is_collaborative,updated_at")
    .single();
  if (error || !data) return fail("createPlaylist", error, "No pudimos crear la playlist.");
  return { ok: true, data: summarize(data as PlaylistRow, [], 0, 0) };
}

export async function updatePlaylist(
  id: string,
  patch: { name?: string; description?: string | null; isPublic?: boolean; isCollaborative?: boolean },
): Promise<LibResult<true>> {
  type Patch = Database["public"]["Tables"]["playlists"]["Update"];
  const row: Patch = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim().slice(0, 80);
    if (!n) return { ok: false, message: "El nombre no puede estar vacío." };
    row.name = n;
  }
  if (patch.description !== undefined) row.description = patch.description?.trim().slice(0, 300) || null;
  if (patch.isPublic !== undefined) row.is_public = patch.isPublic;
  if (patch.isCollaborative !== undefined) row.is_collaborative = patch.isCollaborative;
  const { error } = await supabase.from("playlists").update(row).eq("id", id);
  if (error) return fail("updatePlaylist", error, "No pudimos guardar los cambios.");
  return { ok: true, data: true };
}

export async function deletePlaylist(id: string): Promise<LibResult<true>> {
  const { error } = await supabase.from("playlists").delete().eq("id", id);
  if (error) return fail("deletePlaylist", error, "No pudimos borrar la playlist.");
  return { ok: true, data: true };
}

export async function getPlaylist(id: string): Promise<LibResult<PlaylistDetail>> {
  const [pl, items, members] = await Promise.all([
    supabase
      .from("playlists")
      .select("id,owner_id,name,description,cover_url,is_public,is_collaborative,updated_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("playlist_items")
      .select("id,track_key,snapshot,added_by,added_at,position")
      .eq("playlist_id", id)
      .order("position", { ascending: true })
      .limit(1000),
    supabase.rpc("playlist_member_names", { p_playlist_id: id }),
  ]);
  if (pl.error || !pl.data) return fail("getPlaylist", pl.error, "No encontramos esta playlist.");
  if (items.error) return fail("getPlaylist.items", items.error, "No pudimos cargar las canciones.");

  const rows: PlaylistItemRow[] = [];
  for (const r of items.data ?? []) {
    const item = fromSnapshot(r.snapshot);
    if (item) rows.push({ id: r.id, key: r.track_key, item, addedBy: r.added_by, addedAt: r.added_at });
  }
  const names: PlaylistMember[] = (members.data ?? []).map((m) => ({ userId: m.user_id, username: m.username }));
  const base = summarize(pl.data as PlaylistRow, (items.data ?? []).slice(0, 8), rows.length, Math.max(0, names.length - 1));
  return {
    ok: true,
    data: { ...base, description: (pl.data as PlaylistRow).description, items: rows, members: names },
  };
}

export async function addToPlaylist(userId: string, playlistId: string, item: PlayableItem): Promise<LibResult<"added" | "exists">> {
  const key = trackKeyOf(item);
  if (!key) return { ok: false, message: "Esta canción no se puede añadir." };
  const { error } = await supabase
    .from("playlist_items")
    .insert({ playlist_id: playlistId, track_key: key, snapshot: toSnapshot(item) as TrackSnapshot, added_by: userId });
  if (!error) return { ok: true, data: "added" };
  if (error.code === "23505") return { ok: true, data: "exists" };
  if (error.code === "42501") return { ok: false, message: "No tienes permiso para editar esta playlist." };
  if (error.code === "54000") return { ok: false, message: "La playlist alcanzó el máximo de 1000 canciones." };
  return fail("addToPlaylist", error, "No pudimos añadir la canción.");
}

export async function removeFromPlaylist(itemId: string): Promise<LibResult<true>> {
  const { error } = await supabase.from("playlist_items").delete().eq("id", itemId);
  if (error) return fail("removeFromPlaylist", error, "No pudimos quitar la canción.");
  return { ok: true, data: true };
}

export async function inviteToPlaylist(playlistId: string, username: string): Promise<LibResult<true>> {
  const name = username.trim().replace(/^@/, "");
  if (!name) return { ok: false, message: "Escribe un nombre de usuario." };
  const { error } = await supabase.rpc("add_playlist_member", { p_playlist_id: playlistId, p_username: name });
  if (!error) return { ok: true, data: true };
  if (error.code === "P0002") return { ok: false, message: `No existe el usuario @${name}.` };
  if (error.code === "22023") return { ok: false, message: "Ya eres el dueño de esta playlist." };
  if (error.code === "42501") return { ok: false, message: "Solo el dueño puede invitar." };
  return fail("inviteToPlaylist", error, "No pudimos enviar la invitación.");
}

/** Salir de una playlist (o que el dueño quite a un miembro). */
export async function removeMember(playlistId: string, userId: string): Promise<LibResult<true>> {
  const { error } = await supabase.from("playlist_members").delete().eq("playlist_id", playlistId).eq("user_id", userId);
  if (error) return fail("removeMember", error, "No pudimos completar la acción.");
  return { ok: true, data: true };
}

// ─── Administración ──────────────────────────────────────────────────────────

let adminCache: { userId: string; value: boolean } | null = null;

/** ¿El usuario actual es administrador? (`is_admin()` en el servidor; el resultado se cachea por sesión). */
export async function isCurrentUserAdmin(userId: string): Promise<boolean> {
  if (adminCache?.userId === userId) return adminCache.value;
  const { data, error } = await supabase.rpc("is_admin", { uid: userId });
  const value = !error && data === true;
  adminCache = { userId, value };
  return value;
}
