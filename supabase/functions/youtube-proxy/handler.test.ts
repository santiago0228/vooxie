// Ejecutar (Node 22 + tsx):  npx tsx --test supabase/functions/youtube-proxy/handler.test.ts
// En Deno:                   deno test --allow-none handler.test.ts   (usa node:test)
import test from "node:test";
import assert from "node:assert/strict";
import { type CacheRow, type CacheStore, createHandler, type Deps } from "./handler.ts";

const VID = "dQw4w9WgXcQ";
const TOKEN = "SECRET-TOKEN-XYZ";
let clock = Date.parse("2026-09-30T12:00:00Z");

function memStore(initial: CacheRow[] = []) {
  const rows = new Map(initial.map((r) => [r.youtube_id, { ...r }]));
  const calls = { insert: 0, save: 0, get: 0 };
  const store: CacheStore = {
    async get(id) { calls.get++; const r = rows.get(id); return r ? { ...r } : null; },
    async insertIfMissing(list) {
      calls.insert++;
      for (const r of list) {
        if (!rows.has(r.youtube_id)) {
          rows.set(r.youtube_id, { ...r, stream_url: null, stream_expires_at: null, canvas_url: null, producers: [] });
        }
      }
    },
    async saveStream(id, patch) { calls.save++; Object.assign(rows.get(id)!, patch); },
  };
  return { rows, calls, store };
}

function extractBody(over: Record<string, unknown> = {}) {
  return {
    success: true, videoId: VID, title: "Tu No Vive Así", artist: "Artista",
    artworkUrl: "https://i.ytimg.com/a.jpg", duration: 245,
    streamUrl: "https://rr1.googlevideo.com/videoplayback?x=1",
    streamExpiresAt: new Date(clock + 5 * 3600_000).toISOString(), producers: [], ...over,
  };
}

function make(opts: {
  rows?: CacheRow[];
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  user?: string | null;
  allowed?: string[];
  rate?: number;
} = {}) {
  const m = memStore(opts.rows);
  const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
  const f = (async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    return opts.fetchImpl ? opts.fetchImpl(url, init) : new Response(JSON.stringify(extractBody()), { status: 200 });
  }) as unknown as typeof fetch;
  const deps: Deps = {
    config: { ytdlpUrl: "https://ytdlp.example.com/", ytdlpToken: TOKEN, allowedOrigins: opts.allowed ?? [], rateLimitPerMinute: opts.rate },
    fetch: f, store: m.store, now: () => clock,
    authenticate: async () => (opts.user === undefined ? "user-1" : opts.user),
  };
  return { handler: createHandler(deps), fetchCalls, ...m };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://x/youtube-proxy", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const validRow = (over: Partial<CacheRow> = {}): CacheRow => ({
  youtube_id: VID, title: "Título admin", artist: "Artista admin", artwork_url: "https://a/b.jpg",
  stream_url: "https://old/stream", duration: 240, canvas_url: "https://canvas/c.mp4", producers: ["P1"],
  stream_expires_at: new Date(clock + 3 * 3600_000).toISOString(), ...over,
});

test("CACHE MISS: llama /extract, inserta y devuelve track", async () => {
  const t = make();
  const res = await t.handler(post({ action: "resolve", videoId: VID }));
  const b = await res.json();
  assert.equal(res.status, 200);
  assert.equal(b.cache, "miss");
  assert.equal(b.track.streamUrl, "https://rr1.googlevideo.com/videoplayback?x=1");
  assert.deepEqual(b.track.producers, []);
  assert.equal(t.fetchCalls.length, 1);
  assert.equal(t.fetchCalls[0].url, "https://ytdlp.example.com/extract");
  assert.equal((t.fetchCalls[0].init.headers as Record<string, string>).Authorization, `Bearer ${TOKEN}`);
  assert.equal(t.rows.get(VID)!.stream_url, b.track.streamUrl);
});

test("CACHE HIT con stream válido: NO llama al servicio", async () => {
  const t = make({ rows: [validRow()] });
  const b = await (await t.handler(post({ action: "resolve", videoId: VID }))).json();
  assert.equal(b.cache, "hit");
  assert.equal(b.track.streamUrl, "https://old/stream");
  assert.equal(t.fetchCalls.length, 0);
});

test("stream EXPIRADO: renueva solo el stream y conserva metadata/canvas/productores", async () => {
  const t = make({ rows: [validRow({ stream_expires_at: new Date(clock - 1000).toISOString() })] });
  const b = await (await t.handler(post({ action: "resolve", videoId: VID }))).json();
  assert.equal(b.cache, "refreshed");
  assert.equal(b.track.title, "Título admin");
  assert.equal(b.track.canvasUrl, "https://canvas/c.mp4");
  assert.deepEqual(b.track.producers, ["P1"]);
  assert.equal(b.track.duration, 240);
  assert.equal(b.track.streamUrl, "https://rr1.googlevideo.com/videoplayback?x=1");
  assert.equal(t.rows.get(VID)!.title, "Título admin");
  assert.equal(t.calls.insert, 0);
});

test("stream que expira en < margen se considera vencido", async () => {
  const t = make({ rows: [validRow({ stream_expires_at: new Date(clock + 30_000).toISOString() })] });
  const b = await (await t.handler(post({ action: "resolve", videoId: VID }))).json();
  assert.equal(b.cache, "refreshed");
  assert.equal(t.fetchCalls.length, 1);
});

test("fila con metadata pero sin stream (viene de búsqueda): resuelve stream", async () => {
  const t = make({ rows: [validRow({ stream_url: null, stream_expires_at: null })] });
  const b = await (await t.handler(post({ action: "resolve", videoId: VID }))).json();
  assert.equal(b.track.title, "Título admin");
  assert.ok(b.track.streamUrl);
});

test("dedup: 5 resolve simultáneos => 1 sola extracción", async () => {
  let n = 0;
  const t = make({
    fetchImpl: async () => { n++; await new Promise((r) => setTimeout(r, 30)); return new Response(JSON.stringify(extractBody()), { status: 200 }); },
  });
  const rs = await Promise.all(Array.from({ length: 5 }, () => t.handler(post({ action: "resolve", videoId: VID }))));
  assert.deepEqual(rs.map((r) => r.status), [200, 200, 200, 200, 200]);
  assert.equal(n, 1);
});

test("búsqueda: normaliza, filtra ids inválidos y guarda metadata sin pisar", async () => {
  const t = make({
    rows: [validRow({ stream_url: null, stream_expires_at: null })],
    fetchImpl: async () => new Response(JSON.stringify({ success: true, items: [
      { videoId: VID, title: "Otro título", artist: "X", artworkUrl: "https://i/x.jpg", duration: 100 },
      { videoId: "AAAAAAAAAAA", title: "Nuevo", artist: "Y", artworkUrl: "http://insecure/x.jpg", duration: -5 },
      { videoId: "bad", title: "z" },
    ] }), { status: 200 }),
  });
  const res = await t.handler(post({ action: "search", query: "Tu No Vive Así" }));
  const b = await res.json();
  assert.equal(b.items.length, 2);
  assert.equal(b.items[1].artworkUrl, null);
  assert.equal(b.items[1].duration, null);
  assert.equal(t.rows.get(VID)!.title, "Título admin");
  assert.ok(t.rows.has("AAAAAAAAAAA"));
});

test("validación de input", async () => {
  const t = make();
  const cases: unknown[] = [
    { action: "resolve" }, { action: "resolve", videoId: "short" },
    { action: "resolve", videoId: "https://youtube.com/watch?v=x" },
    { action: "search", query: "" }, { action: "search", query: "a".repeat(201) },
    { action: "otra" }, {},
  ];
  for (const c of cases) {
    const res = await t.handler(post(c));
    assert.equal(res.status, 400, JSON.stringify(c));
    assert.equal((await res.json()).code, "INVALID_REQUEST");
  }
  const bad = await t.handler(new Request("https://x", { method: "POST", body: "no json" }));
  assert.equal(bad.status, 400);
  const get = await t.handler(new Request("https://x", { method: "GET" }));
  assert.equal(get.status, 400);
  assert.equal(t.fetchCalls.length, 0);
});

test("auth: sin sesión => 401 y no se toca el servicio", async () => {
  const t = make({ user: null });
  const res = await t.handler(post({ action: "resolve", videoId: VID }));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "UNAUTHORIZED");
  assert.equal(t.fetchCalls.length, 0);
});

test("timeout upstream => UPSTREAM_TIMEOUT 504", async () => {
  const t = make({ fetchImpl: async () => { const e = new Error("abort"); e.name = "AbortError"; throw e; } });
  const res = await t.handler(post({ action: "resolve", videoId: VID }));
  assert.equal(res.status, 504);
  assert.equal((await res.json()).code, "UPSTREAM_TIMEOUT");
});

test("servicio caído => EXTRACT_FAILED y NO filtra secretos ni URL interna", async () => {
  const t = make({ fetchImpl: async () => { throw new TypeError("connect ECONNREFUSED ytdlp.example.com " + TOKEN); } });
  const res = await t.handler(post({ action: "resolve", videoId: VID }));
  const text = await res.text();
  assert.equal(res.status, 502);
  assert.ok(!text.includes(TOKEN));
  assert.ok(!text.includes("ytdlp.example.com"));
});

test("el servicio rechaza el token => error genérico (config), sin detalles", async () => {
  const t = make({ fetchImpl: async () => new Response(JSON.stringify({ success: false, code: "UNAUTHORIZED" }), { status: 401 }) });
  const res = await t.handler(post({ action: "resolve", videoId: VID }));
  const b = await res.json();
  assert.equal(res.status, 502);
  assert.equal(b.code, "EXTRACT_FAILED");
});

test("códigos del servicio se propagan (TRACK_NOT_FOUND => 404)", async () => {
  const t = make({ fetchImpl: async () => new Response(JSON.stringify({ success: false, code: "TRACK_NOT_FOUND" }), { status: 404 }) });
  const res = await t.handler(post({ action: "resolve", videoId: VID }));
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, "TRACK_NOT_FOUND");
});

test("respuestas inválidas del extractor se rechazan", async () => {
  for (const bad of [
    extractBody({ streamUrl: "http://insecure/x" }),
    extractBody({ streamUrl: "https://youtube.com/watch?v=abc".replace("https", "ftp") }),
    extractBody({ streamExpiresAt: "no-fecha" }),
    extractBody({ videoId: "OTROIDXXXXX" }),
    { success: true },
  ]) {
    const t = make({ fetchImpl: async () => new Response(JSON.stringify(bad), { status: 200 }) });
    const res = await t.handler(post({ action: "resolve", videoId: VID }));
    assert.equal(res.status, 502, JSON.stringify(bad));
    assert.equal(t.rows.size, 0);
  }
});

test("stream ya vencido devuelto por el extractor => STREAM_EXPIRED", async () => {
  const t = make({ fetchImpl: async () => new Response(JSON.stringify(extractBody({ streamExpiresAt: new Date(clock - 5000).toISOString() })), { status: 200 }) });
  const res = await t.handler(post({ action: "resolve", videoId: VID }));
  assert.equal((await res.json()).code, "STREAM_EXPIRED");
});

test("CORS: sin Origin no hay ACAO; origen permitido sí; otro no", async () => {
  const t = make({ allowed: ["https://admin.vooxie.app"] });
  let r = await t.handler(post({ action: "resolve", videoId: "bad" }));
  assert.equal(r.headers.get("access-control-allow-origin"), null);
  r = await t.handler(post({ action: "resolve", videoId: "bad" }, { origin: "https://admin.vooxie.app" }));
  assert.equal(r.headers.get("access-control-allow-origin"), "https://admin.vooxie.app");
  r = await t.handler(post({ action: "resolve", videoId: "bad" }, { origin: "https://evil.com" }));
  assert.equal(r.headers.get("access-control-allow-origin"), null);
  const pre = await t.handler(new Request("https://x", { method: "OPTIONS", headers: { origin: "https://admin.vooxie.app" } }));
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("access-control-allow-headers")!, /authorization/);
});

test("rate limit por usuario", async () => {
  const t = make({ rate: 3, rows: [validRow()] });
  const codes: number[] = [];
  for (let i = 0; i < 5; i++) codes.push((await t.handler(post({ action: "resolve", videoId: VID }))).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});

test("error de caché al leer => CACHE_ERROR 500", async () => {
  const t = make();
  (t.store as { get: unknown }).get = async () => { throw new Error("db down"); };
  const res = await t.handler(post({ action: "resolve", videoId: VID }));
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "CACHE_ERROR");
});

test("staleStreamUrl igual al cacheado => fuerza re-extracción aunque no haya vencido", async () => {
  const t = make({ rows: [validRow()] });
  const b = await (await t.handler(post({ action: "resolve", videoId: VID, staleStreamUrl: "https://old/stream" }))).json();
  assert.equal(b.cache, "refreshed");
  assert.equal(t.fetchCalls.length, 1);
  assert.notEqual(b.track.streamUrl, "https://old/stream");
  assert.equal(b.track.canvasUrl, "https://canvas/c.mp4");
});

test("staleStreamUrl distinto al cacheado (otro ya renovó) => hit sin extraer", async () => {
  const t = make({ rows: [validRow()] });
  const b = await (await t.handler(post({ action: "resolve", videoId: VID, staleStreamUrl: "https://otra/vieja" }))).json();
  assert.equal(b.cache, "hit");
  assert.equal(t.fetchCalls.length, 0);
});
