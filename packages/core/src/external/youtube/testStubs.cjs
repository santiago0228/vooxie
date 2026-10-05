// Solo para tests en Node: sustituye Supabase y el cliente de la Edge Function por stubs controlables.
const path = require("path");
const g = globalThis;
g.__stub = { matchRows: {}, cacheRows: {}, proxyCalls: [], proxyImpl: null };

const supabasePath = path.resolve(__dirname, "../../supabase/client.ts");
const from = (table) => {
  const q = { _t: table, _f: {} };
  q.select = () => q;
  q.eq = (k, v) => { q._f[k] = v; return q; };
  q.maybeSingle = async () => {
    if (table === "track_matches") return { data: g.__stub.matchRows[q._f.deezer_id] ?? null, error: null };
    if (table === "youtube_tracks_cache") return { data: g.__stub.cacheRows[q._f.youtube_id] ?? null, error: null };
    return { data: null, error: null };
  };
  return q;
};
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, children: [], paths: [], exports: { supabase: { from } } };

const clientPath = path.resolve(__dirname, "./client.ts");
class YouTubeError extends Error { constructor(m, code, proxyCode) { super(m); this.code = code; this.proxyCode = proxyCode; } }
require.cache[clientPath] = {
  id: clientPath, filename: clientPath, loaded: true, children: [], paths: [],
  exports: { YouTubeError, callProxy: async (req) => { g.__stub.proxyCalls.push(req); return g.__stub.proxyImpl(req); } },
};
