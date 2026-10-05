// Ejecutar:  npx tsx --test packages/core/src/external/youtube/resolveCatalog.test.ts
import "./testStubs.cjs";
import test from "node:test";
import assert from "node:assert/strict";
import { __resetResolveState, prefetchTracks, resolveAny, resolveCatalogTrack } from "./youtubeService.ts";
import { mapDeezerTrack } from "../deezer/mapper.ts";

type Stub = { matchRows: Record<number, unknown>; cacheRows: Record<string, unknown>; proxyCalls: any[]; proxyImpl: (r: any) => any };
const stub = (globalThis as unknown as { __stub: Stub }).__stub;
const VID = "dQw4w9WgXcQ";
const future = (ms: number) => new Date(Date.now() + ms).toISOString();

const dz = () => mapDeezerTrack({
  id: 100, title: "Hawái", duration: 200, rank: 1,
  artist: { id: 5, name: "Maluma" }, album: { id: 50, title: "Papi Juancho", cover_xl: "https://cdn/pj.jpg" },
})!;

const proxyTrack = (over: Record<string, unknown> = {}) => ({
  success: true, cache: "miss",
  track: { videoId: VID, title: "Maluma - Hawái (Video Oficial)", artist: "Canal", artworkUrl: "https://yt/thumb.jpg", duration: 200,
    streamUrl: "https://rr1.googlevideo.com/x", streamExpiresAt: future(3_600_000), canvasUrl: null, producers: [], ...over },
});

test.beforeEach(() => {
  __resetResolveState();
  stub.matchRows = {}; stub.cacheRows = {}; stub.proxyCalls = []; stub.proxyImpl = () => proxyTrack();
});

test("primera vez: resolve_match y conserva la metadata OFICIAL del catálogo", async () => {
  const r = await resolveCatalogTrack(dz());
  assert.equal(stub.proxyCalls.length, 1);
  assert.deepEqual(stub.proxyCalls[0], { action: "resolve_match", artist: "Maluma", title: "Hawái", duration: 200, deezerId: 100, artworkUrl: "https://cdn/pj.jpg" });
  assert.equal(r.title, "Hawái");
  assert.equal(r.artist.name, "Maluma");
  assert.equal(r.artwork?.large, "https://cdn/pj.jpg");
  assert.equal(r.externalId, "dz:100");
  assert.equal(r.youtubeId, VID);
  assert.equal(r.streamUrl, "https://rr1.googlevideo.com/x");
});

test("emparejado conocido + stream en caché: NO llama a la función", async () => {
  stub.matchRows[100] = { youtube_id: VID };
  stub.cacheRows[VID] = { youtube_id: VID, title: "Hawái", artist: "Maluma", artwork_url: null, stream_url: "https://old/stream", duration: 200,
    canvas_url: "https://canvas/c.mp4", producers: [], stream_expires_at: future(3_600_000) };
  const r = await resolveCatalogTrack(dz());
  assert.equal(stub.proxyCalls.length, 0);
  assert.equal(r.streamUrl, "https://old/stream");
  assert.equal(r.canvasUrl, "https://canvas/c.mp4");
});

test("emparejado conocido pero stream vencido: renueva por youtube_id (resolve), no vuelve a buscar", async () => {
  stub.matchRows[100] = { youtube_id: VID };
  stub.cacheRows[VID] = { youtube_id: VID, title: "Hawái", artist: "Maluma", artwork_url: null, stream_url: "https://old", duration: 200,
    canvas_url: null, producers: [], stream_expires_at: future(-1000) };
  await resolveCatalogTrack(dz());
  assert.equal(stub.proxyCalls.length, 1);
  assert.equal(stub.proxyCalls[0].action, "resolve");
  assert.equal(stub.proxyCalls[0].videoId, VID);
});

test("memo: la segunda resolución es instantánea; con stale se fuerza otra", async () => {
  const t = dz();
  await resolveCatalogTrack(t);
  await resolveCatalogTrack(t);
  assert.equal(stub.proxyCalls.length, 1);
  await resolveCatalogTrack(t, { staleStreamUrl: "https://rr1.googlevideo.com/x" });
  assert.equal(stub.proxyCalls.length, 2);
});

test("peticiones simultáneas a la misma canción comparten una sola llamada", async () => {
  stub.proxyImpl = async () => { await new Promise((r) => setTimeout(r, 20)); return proxyTrack(); };
  const t = dz();
  await Promise.all([resolveCatalogTrack(t), resolveCatalogTrack(t), resolveCatalogTrack(t)]);
  assert.equal(stub.proxyCalls.length, 1);
});

test("resolveAny: track de YouTube normal usa resolve por id", async () => {
  const yt = { ...dz(), externalId: VID, deezerId: null, streamRef: VID };
  await resolveAny(yt);
  assert.equal(stub.proxyCalls[0].action, "resolve");
});

test("prefetchTracks calienta la memo (máx. 2 a la vez) y luego resolveCatalogTrack no llama", async () => {
  const mk = (id: number) => mapDeezerTrack({ id, title: `T${id}`, duration: 100, artist: { id: 1, name: "A" }, album: { id: 1, title: "Al", cover_xl: "https://c/x.jpg" } })!;
  let concurrent = 0, max = 0;
  stub.proxyImpl = async () => { concurrent++; max = Math.max(max, concurrent); await new Promise((r) => setTimeout(r, 25)); concurrent--; return proxyTrack(); };
  prefetchTracks([mk(1), mk(2), mk(3), mk(4)]);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(stub.proxyCalls.length, 4);
  assert.ok(max <= 2, `concurrencia ${max}`);
  const before = stub.proxyCalls.length;
  await resolveCatalogTrack(mk(1));
  assert.equal(stub.proxyCalls.length, before);
});

test("error del servicio se propaga y NO deja memo", async () => {
  stub.proxyImpl = () => { throw new Error("boom"); };
  await assert.rejects(resolveCatalogTrack(dz()), /boom/);
  stub.proxyImpl = () => proxyTrack();
  const r = await resolveCatalogTrack(dz());
  assert.ok(r.streamUrl);
});
