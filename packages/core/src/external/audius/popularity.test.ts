// Ejecutar:  npx tsx --test packages/core/src/external/audius/popularity.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { popularArtists, popularTracks } from "./popularity.ts";
import type { ExternalArtist, ExternalTrack } from "../types";

const t = (id: string, title: string, artist: string, plays: number | null): ExternalTrack => ({
  source: "audius", externalId: id, title, artist: { externalId: artist, name: artist, handle: null },
  artwork: null, durationSeconds: 180, genre: null, isExplicit: false, streamRef: `https://s/${id}`, playCount: plays,
});
const a = (id: string, followers: number | null, verified = false): ExternalArtist => ({
  source: "audius", externalId: id, name: id, handle: null, avatarUrl: null, verified, followerCount: followers, trackCount: 1,
});

test("tracks: descarta genéricos y ordena por reproducciones", () => {
  const out = popularTracks([
    t("1", "Beat genérico 2", "Nobody", 120),
    t("2", "Hit", "Star", 900_000),
    t("3", "Otro hit", "Star2", 25_000),
    t("4", "Sin datos", "X", null),
  ], "hit", 10);
  assert.deepEqual(out.map((x) => x.externalId), ["2", "3"]);
});

test("tracks: umbral menor si coincide con lo buscado", () => {
  const out = popularTracks([t("1", "Ahora Me Llama", "Alguien", 6_000), t("2", "Otra cosa", "Alguien", 6_000)], "ahora me llama", 10);
  assert.deepEqual(out.map((x) => x.externalId), ["1"]);
});

test("tracks: respeta el máximo", () => {
  const many = Array.from({ length: 30 }, (_, i) => t(String(i), `T${i}`, "A", 50_000 + i));
  assert.equal(popularTracks(many, "x", 8).length, 8);
});

test("artistas: verificados o con seguidores", () => {
  const out = popularArtists([a("a", 10), a("b", 5000), a("c", 5, true), a("d", null)], 10);
  assert.deepEqual(out.map((x) => x.externalId), ["b", "c"]);
});
