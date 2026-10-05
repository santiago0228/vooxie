// Ejecutar:  npx tsx --test packages/core/src/external/youtube/mapper.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  externalToUnifiedTrack, isStreamValid, isValidVideoId, mapExtractResponse,
  mapSearchItem, unifiedToExternalTrack,
} from "./mapper.ts";

const VID = "dQw4w9WgXcQ";
const now = Date.parse("2026-09-30T12:00:00Z");
const future = (ms: number) => new Date(now + ms).toISOString();

test("isValidVideoId", () => {
  assert.ok(isValidVideoId(VID));
  for (const bad of ["", "short", "https://youtu.be/x", 123, null, "a".repeat(12)]) assert.ok(!isValidVideoId(bad));
});

test("isStreamValid: válido, vencido, dentro del margen, sin datos", () => {
  assert.ok(isStreamValid({ streamUrl: "https://a", streamExpiresAt: future(3600_000) }, now));
  assert.ok(!isStreamValid({ streamUrl: "https://a", streamExpiresAt: future(-1) }, now));
  assert.ok(!isStreamValid({ streamUrl: "https://a", streamExpiresAt: future(30_000) }, now));
  assert.ok(!isStreamValid({ streamUrl: null, streamExpiresAt: future(3600_000) }, now));
  assert.ok(!isStreamValid({ streamUrl: "https://a", streamExpiresAt: null }, now));
  assert.ok(!isStreamValid({ streamUrl: "https://a", streamExpiresAt: "basura" }, now));
});

test("mapSearchItem: sin stream y descarta inválidos", () => {
  const t = mapSearchItem({ videoId: VID, title: " Tu No Vive Así ", artist: "", artworkUrl: "http://x", duration: 0 });
  assert.equal(t?.title, "Tu No Vive Así");
  assert.equal(t?.artist, "Desconocido");
  assert.equal(t?.streamUrl, null);
  assert.equal(t?.artworkUrl, null);
  assert.equal(t?.duration, null);
  assert.equal(mapSearchItem({ videoId: "x", title: "t", artist: "a", artworkUrl: null, duration: 1 }), null);
});

test("mapExtractResponse: stream y expiración van juntos; conserva canvas/productores", () => {
  const ok = mapExtractResponse({
    videoId: VID, title: "T", artist: "A", artworkUrl: "https://i/x.jpg", duration: 245.4,
    streamUrl: "https://s/a", streamExpiresAt: future(1000), canvasUrl: "https://c/v.mp4", producers: ["P", 5 as unknown as string],
  });
  assert.equal(ok?.duration, 245);
  assert.deepEqual(ok?.producers, ["P"]);
  assert.equal(ok?.canvasUrl, "https://c/v.mp4");
  const noExp = mapExtractResponse({
    videoId: VID, title: "T", artist: "A", artworkUrl: null, duration: null,
    streamUrl: "https://s/a", streamExpiresAt: null, canvasUrl: null, producers: [],
  });
  assert.equal(noExp?.streamUrl, null);
  assert.equal(noExp?.streamExpiresAt, null);
  const http = mapExtractResponse({
    videoId: VID, title: "T", artist: "A", artworkUrl: null, duration: null,
    streamUrl: "http://s/a", streamExpiresAt: future(1000), canvasUrl: null, producers: [],
  });
  assert.equal(http?.streamUrl, null);
});

test("UnifiedTrack ⇄ ExternalTrack ida y vuelta conserva todo", () => {
  const u = mapExtractResponse({
    videoId: VID, title: "T", artist: "A", artworkUrl: "https://i/x.jpg", duration: 100,
    streamUrl: "https://s/a", streamExpiresAt: future(5000), canvasUrl: "https://c/v.mp4", producers: ["P"],
  })!;
  const e = unifiedToExternalTrack(u);
  assert.equal(e.source, "youtube");
  assert.equal(e.streamRef, VID);
  assert.deepEqual(externalToUnifiedTrack(e), u);
});

import { cleanTrackTitle } from "./mapper.ts";

test("cleanTrackTitle: quita prefijo de artista y sufijos de video oficial", () => {
  assert.equal(cleanTrackTitle("Eladio Carrión - Polaroid (Video Oficial)", "Eladio Carrion"), "Polaroid");
  assert.equal(cleanTrackTitle("Feid - Normal (Official Video)", "Feid"), "Normal");
  assert.equal(cleanTrackTitle("Eladio Carrión - Que Cojones (Of...", "Eladio Carrion"), "Que Cojones (Of...");
  assert.equal(cleanTrackTitle("Anuel AA - Ahora Me Llama [Official Audio] (HD)", "Anuel AA - Topic"), "Ahora Me Llama");
});

test("cleanTrackTitle: conserva feat/remix/live y títulos con guion que no son el artista", () => {
  assert.equal(cleanTrackTitle("Bby Wow (feat. Anuel AA)", "Karol G"), "Bby Wow (feat. Anuel AA)");
  assert.equal(cleanTrackTitle("Bichota (Remix)", "Karol G"), "Bichota (Remix)");
  assert.equal(cleanTrackTitle("Tu No Vive Así - Live", "Romeo Santos"), "Tu No Vive Así - Live");
  assert.equal(cleanTrackTitle("Official Video", "X"), "Official Video");
});
