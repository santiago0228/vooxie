/**
 * SUPABASE EDGE FUNCTION — youtube-proxy
 *
 *   App ──(JWT de usuario)──▶ youtube-proxy ──(Bearer secreto)──▶ servicio yt-dlp
 *                                  │
 *                                  └──(service_role)──▶ public.youtube_tracks_cache
 *
 * Secretos (supabase secrets set ...):
 *   YTDLP_SERVICE_URL, YTDLP_SERVICE_TOKEN, ALLOWED_ORIGINS (opcional, separados por coma)
 * Supabase inyecta automáticamente: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Ninguno de estos valores llega jamás al bundle de la app.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { type CacheRow, type CacheStore, createHandler } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const YTDLP_URL = Deno.env.get("YTDLP_SERVICE_URL") ?? "";
const YTDLP_TOKEN = Deno.env.get("YTDLP_SERVICE_TOKEN") ?? "";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY || !YTDLP_URL || !YTDLP_TOKEN) {
  console.error("youtube-proxy: faltan variables de entorno requeridas.");
}

// Cliente con service_role: SOLO dentro de esta función (backend).
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const COLUMNS =
  "youtube_id,title,artist,artwork_url,stream_url,duration,canvas_url,producers,stream_expires_at";

const store: CacheStore = {
  async get(videoId) {
    const { data, error } = await admin
      .from("youtube_tracks_cache").select(COLUMNS).eq("youtube_id", videoId).maybeSingle();
    if (error) throw error;
    return (data as CacheRow | null) ?? null;
  },
  async insertIfMissing(rows) {
    if (!rows.length) return;
    const { error } = await admin
      .from("youtube_tracks_cache")
      .upsert(rows, { onConflict: "youtube_id", ignoreDuplicates: true });
    if (error) throw error;
  },
  async getMatch(deezerId) {
    const { data, error } = await admin
      .from("track_matches").select("youtube_id").eq("deezer_id", deezerId).maybeSingle();
    if (error) throw error;
    return (data as { youtube_id: string } | null)?.youtube_id ?? null;
  },
  async saveMatch(deezerId, youtubeId) {
    const { error } = await admin
      .from("track_matches").upsert({ deezer_id: deezerId, youtube_id: youtubeId }, { onConflict: "deezer_id" });
    if (error) throw error;
  },
  async saveStream(videoId, patch) {
    const { error } = await admin
      .from("youtube_tracks_cache").update(patch).eq("youtube_id", videoId);
    if (error) throw error;
  },
};

async function authenticate(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  // Se valida con la anon key + el JWT del usuario (no con service_role).
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

const handler = createHandler({
  config: {
    ytdlpUrl: YTDLP_URL,
    ytdlpToken: YTDLP_TOKEN,
    allowedOrigins: ALLOWED_ORIGINS,
  },
  fetch,
  store,
  authenticate,
  // Responde primero y guarda en la caché después (el cliente no espera al UPSERT).
  background: (work) => {
    const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(work);
    else void work;
  },
  log: (level, msg, extra) => console[level](`[youtube-proxy] ${msg}`, extra ?? ""),
});

Deno.serve(handler);
