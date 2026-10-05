/** Adaptador de BD (service_role). Escribe artist_profiles / albums / tracks / track_artists. */
import { createClient } from "@supabase/supabase-js";

function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

export function createSupabaseDb({ url, serviceRoleKey }) {
  const sb = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  return {
    async upsertArtist(row, { full }) {
      const found = must(await sb.from("artist_profiles").select("id, avatar_url").eq("deezer_id", row.deezer_id).maybeSingle(), "buscar artista");
      if (!found) {
        const ins = must(await sb.from("artist_profiles").insert({
          origin: "catalog", user_id: null,
          deezer_id: row.deezer_id, display_name: row.display_name,
          avatar_url: row.avatar_url, monthly_listeners: row.monthly_listeners,
        }).select("id").single(), "crear artista");
        return ins.id;
      }
      const patch = {};
      if (!found.avatar_url && row.avatar_url) patch.avatar_url = row.avatar_url; // nunca pisa una foto subida a mano
      if (full && row.monthly_listeners != null) patch.monthly_listeners = row.monthly_listeners;
      if (Object.keys(patch).length) must(await sb.from("artist_profiles").update(patch).eq("id", found.id), "actualizar artista");
      return found.id;
    },

    async upsertAlbum(row) {
      const found = must(await sb.from("albums").select("id, cover_url").eq("deezer_id", row.deezer_id).maybeSingle(), "buscar álbum");
      if (!found) return must(await sb.from("albums").insert(row).select("id").single(), "crear álbum").id;
      const { cover_url, ...rest } = row;
      must(await sb.from("albums").update({ ...rest, ...(found.cover_url ? {} : { cover_url }) }).eq("id", found.id), "actualizar álbum");
      return found.id;
    },

    async findTrack(deezerId) {
      return must(await sb.from("tracks").select("id, youtube_id").eq("deezer_id", deezerId).maybeSingle(), "buscar track");
    },

    async upsertTrack(row) {
      const found = must(await sb.from("tracks").select("id, youtube_id").eq("deezer_id", row.deezer_id).maybeSingle(), "buscar track");
      if (!found) return must(await sb.from("tracks").insert(row).select("id").single(), "crear track").id;
      const { youtube_id, ...rest } = row;
      must(await sb.from("tracks").update({ ...rest, youtube_id: found.youtube_id ?? youtube_id }).eq("id", found.id), "actualizar track");
      return found.id;
    },

    async setTrackArtists(trackId, list) {
      const rows = list.map((p) => ({ track_id: trackId, artist_id: p.artistId, role: p.role, position: p.position }));
      must(await sb.from("track_artists").upsert(rows, { onConflict: "track_id,artist_id" }), "vincular artistas");
    },
  };
}
