// Ejecutar:  npx tsx --test packages/core/src/library/trackSnapshot.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { fromSnapshot, isValidTrackKey, snapshotSummary, toSnapshot, trackKeyOf } from "./trackSnapshot.ts";
import { mapDeezerTrack } from "../external/deezer/mapper.ts";
import type { Track } from "../catalog/types";
import type { ExternalTrack } from "../external/types";

const dz = () => mapDeezerTrack({ id: 100, title: "Hawái", duration: 200, artist: { id: 5, name: "Maluma" }, album: { id: 1, title: "A", cover_xl: "https://c/x.jpg" } })!;
const own = { id: "11111111-1111-1111-1111-111111111111", title: "Mío", audio_url: "https://s/a.mp3", youtube_id: null,
  artist: { id: "a", display_name: "Yo", avatar_url: null, verified: false }, resolvedCoverUrl: "https://c/y.jpg", duration_seconds: 10 } as unknown as Track;

test("trackKeyOf: cada fuente tiene su prefijo", () => {
  assert.equal(trackKeyOf(dz()), "dz:100");
  assert.equal(trackKeyOf(own), "vx:11111111-1111-1111-1111-111111111111");
  assert.equal(trackKeyOf({ ...dz(), deezerId: null, externalId: "dQw4w9WgXcQ" }), "yt:dQw4w9WgXcQ");
  assert.equal(trackKeyOf({ ...dz(), source: "audius", deezerId: null, externalId: "D7KyD" } as ExternalTrack), "au:D7KyD");
  assert.equal(trackKeyOf({ ...dz(), deezerId: null, externalId: "tiene espacios!" }), null);
});

test("isValidTrackKey", () => {
  assert.ok(isValidTrackKey("dz:100"));
  assert.ok(!isValidTrackKey("zz:1"));
  assert.ok(!isValidTrackKey("dz:"));
});

test("snapshot externo: va y vuelve SIN stream", () => {
  const t = { ...dz(), streamUrl: "https://temporal/stream", streamExpiresAt: "2030-01-01T00:00:00Z" };
  const snap = toSnapshot(t);
  assert.ok(!JSON.stringify(snap).includes("temporal/stream"));
  const back = fromSnapshot(snap) as ExternalTrack;
  assert.equal(back.title, "Hawái");
  assert.equal(back.deezerId, 100);
  assert.equal(back.streamUrl, null);
  assert.ok(JSON.stringify(snap).length < 8192);
});

test("snapshot VooXiE: conserva el track completo", () => {
  const back = fromSnapshot(toSnapshot(own)) as Track;
  assert.equal(back.id, own.id);
  assert.equal(back.audio_url, "https://s/a.mp3");
});

test("fromSnapshot rechaza basura", () => {
  for (const bad of [null, 1, {}, { kind: "x" }, { kind: "external", track: {} }, { kind: "vooxie", track: { id: 1 } }]) {
    assert.equal(fromSnapshot(bad), null);
  }
  assert.equal(snapshotSummary({}).title, "Canción no disponible");
});

test("snapshotSummary", () => {
  assert.deepEqual(snapshotSummary(toSnapshot(dz())), { title: "Hawái", artist: "Maluma", cover: "https://c/x.jpg" });
  assert.deepEqual(snapshotSummary(toSnapshot(own)), { title: "Mío", artist: "Yo", cover: "https://c/y.jpg" });
});
