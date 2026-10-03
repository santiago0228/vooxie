// Ejecutar:  npx tsx --test packages/core/src/player/usePlayerStore.test.ts
import "./testSetup.cjs";
import test from "node:test";
import assert from "node:assert/strict";
import { usePlayerStore } from "./usePlayerStore";
import { getItemId } from "./PlayableItem";
import { getPlayableUri } from "./getPlayableUri";
import { unifiedToExternalTrack } from "../external/youtube/mapper";
import type { ExternalTrack } from "../external/types";
import type { Track } from "../catalog/types";

const yt = (id: string, stream: boolean): ExternalTrack =>
  unifiedToExternalTrack({
    id, title: `T-${id}`, artist: "A", artworkUrl: null, duration: 200, canvasUrl: null, producers: [], source: "youtube",
    streamUrl: stream ? `https://s/${id}` : null,
    streamExpiresAt: stream ? new Date(Date.now() + 3600_000).toISOString() : null,
  });
const A = "AAAAAAAAAAA", B = "BBBBBBBBBBB", C = "CCCCCCCCCCC";
const S = () => usePlayerStore.getState();

test("playTrack(youtube sin stream): loading y sin URL reproducible", () => {
  S().playTrack(yt(A, false), [yt(A, false), yt(B, false), yt(C, false)]);
  assert.equal(S().status, "loading");
  assert.equal(getItemId(S().currentTrack!), A);
  assert.equal(getPlayableUri(S().currentTrack), null);
});

test("updateTrack con el mismo id: pone el stream sin tocar posición ni cola", () => {
  usePlayerStore.setState({ positionSeconds: 42 });
  S().updateTrack(yt(A, true));
  assert.equal(getPlayableUri(S().currentTrack), `https://s/${A}`);
  assert.equal(S().positionSeconds, 42);
  assert.equal(S().queue.length, 3);
  assert.equal(getPlayableUri(S().queue[0]), `https://s/${A}`);
});

test("updateTrack de OTRO id no cambia el track actual", () => {
  S().updateTrack(yt(B, true));
  assert.equal(getItemId(S().currentTrack!), A);
  assert.equal(getPlayableUri(S().queue[1]), `https://s/${B}`);
});

test("cambio rápido A→B→C: el actual es C y no hay estado de A", () => {
  S().playTrack(yt(A, false), [yt(A, false), yt(B, false), yt(C, false)]);
  S().playTrack(yt(B, false));
  S().playTrack(yt(C, false));
  assert.equal(getItemId(S().currentTrack!), C);
  assert.equal(S().playbackError, null);
  assert.equal(S().status, "loading");
});

test("un updateTrack tardío de A no pisa a C", () => {
  S().updateTrack(yt(A, true));
  assert.equal(getItemId(S().currentTrack!), C);
});

test("error de reproducción: loading + playbackError con la url que falló + resume", () => {
  S().playTrack(yt(A, true), [yt(A, true)]);
  S()._reportPlaybackError(A, `https://s/${A}`, 77);
  assert.equal(S().status, "loading");
  assert.deepEqual({ ...S().playbackError, at: 0 }, { trackId: A, streamUrl: `https://s/${A}`, at: 0 });
  assert.equal(S().resumeAtSeconds, 77);
});

test("togglePlayPause en error (YouTube): reintento manual vía playbackError", () => {
  usePlayerStore.setState({ status: "error", playbackError: null });
  S().togglePlayPause();
  assert.equal(S().status, "loading");
  assert.equal(S().playbackError?.manual, true);
});

test("togglePlayPause en error (audio propio): recarga con retryNonce", () => {
  const own = { id: "u1", title: "x", artist: { display_name: "a" }, audio_url: "https://s/a.mp3", duration_seconds: 10, resolvedCoverUrl: null } as unknown as Track;
  S().playTrack(own, [own]);
  usePlayerStore.setState({ status: "error" });
  const n = S().retryNonce;
  S().togglePlayPause();
  assert.equal(S().retryNonce, n + 1);
  assert.equal(S().status, "loading");
  assert.equal(S().playbackError, null);
});

test("play/pause normal", () => {
  usePlayerStore.setState({ status: "playing" });
  S().togglePlayPause(); assert.equal(S().status, "paused");
  S().togglePlayPause(); assert.equal(S().status, "playing");
});

test("playTrack de un track importado (solo youtube_id) lo convierte a YouTube", () => {
  const imported = { id: "uuid", title: "Ahora Me Llama", artist: { display_name: "Anuel AA" }, audio_url: null, youtube_id: "dQw4w9WgXcQ", duration_seconds: 200, is_explicit: false, resolvedCoverUrl: null } as unknown as Track;
  S().playTrack(imported, [imported]);
  assert.equal(getItemId(S().currentTrack!), "dQw4w9WgXcQ");
  assert.equal(getPlayableUri(S().currentTrack), null); // aún sin stream: lo resuelve el TrackResolver
});

test("seekTo emite una solicitud con token creciente", () => {
  S().seekTo(10); const t1 = S().seekRequest!.token;
  S().seekTo(20); assert.ok(S().seekRequest!.token > t1);
});
