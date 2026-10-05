// Ejecutar:  npx tsx --test packages/core/src/catalog/playable.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { getPlayableId, toPlayable } from "./playable";
import type { Track } from "./types";

const base = {
  id: "uuid-1", album_id: null, artist_id: "a1", title: "Ahora Me Llama", description: null,
  audio_url: null, youtube_id: "dQw4w9WgXcQ", cover_url: null, duration_seconds: 200, track_number: 1,
  is_explicit: true, status: "published", plays_count: 0, created_at: "2026-01-01",
  artist: { id: "a1", display_name: "Anuel AA", avatar_url: null, verified: true },
  resolvedCoverUrl: "https://c/x.jpg", genres: [],
} as unknown as Track;

test("track importado (sin audio_url) → track de YouTube con el youtube_id", () => {
  const p = toPlayable(base) as { source: string; externalId: string; streamUrl: null; isExplicit: boolean; durationSeconds: number };
  assert.equal(p.source, "youtube");
  assert.equal(p.externalId, "dQw4w9WgXcQ");
  assert.equal(p.streamUrl, null);
  assert.equal(p.isExplicit, true);
  assert.equal(p.durationSeconds, 200);
  assert.equal(getPlayableId(base), "dQw4w9WgXcQ");
});

test("track con archivo propio no cambia", () => {
  const own = { ...base, audio_url: "https://s/a.mp3", youtube_id: null } as Track;
  assert.equal(toPlayable(own), own);
  assert.equal(getPlayableId(own), "uuid-1");
});

test("track con audio_url Y youtube_id usa el audio propio", () => {
  const both = { ...base, audio_url: "https://s/a.mp3" } as Track;
  assert.equal(toPlayable(both), both);
});
