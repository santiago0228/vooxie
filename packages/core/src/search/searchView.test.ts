// Ejecutar:  npx tsx --test packages/core/src/search/searchView.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchView, textMatch } from "./searchView.ts";
import { mapDeezerAlbum, mapDeezerArtist, mapDeezerTrack } from "../external/deezer/mapper.ts";
import type { ExternalSearchResults, ExternalTrack } from "../external/types";
import type { SearchResults, Track } from "../catalog/types";

const dzTrack = (id: number, title: string, artist: string): ExternalTrack =>
  mapDeezerTrack({ id, title, duration: 200, rank: 1, artist: { id: id * 10, name: artist }, album: { id: 1, title: "Al", cover_xl: "https://c/x.jpg" } })!;

const deezer = (tracks: ExternalTrack[], artists: unknown[] = [], albums: unknown[] = []): ExternalSearchResults => ({
  source: "youtube", tracks,
  artists: artists.map(mapDeezerArtist).filter((a): a is NonNullable<typeof a> => !!a),
  albums: albums.map(mapDeezerAlbum).filter((a): a is NonNullable<typeof a> => !!a),
});

const base = { catalog: null, fallback: null, audius: null };

test("textMatch: exacto > empieza > palabra > contiene; ignora acentos", () => {
  assert.equal(textMatch("hawai", "Hawái"), 100);
  assert.equal(textMatch("haw", "Hawái"), 85);
  assert.equal(textMatch("juan", "El Juan Perez"), 70);
  assert.equal(textMatch("wái", "Hawái"), 55 - 0 === 55 ? 55 : 0);
  assert.equal(textMatch("zzz", "Hawái"), 0);
});

test("la canción profesional va primero y es el resultado principal", () => {
  const v = buildSearchView({
    ...base, query: "hawai",
    deezer: deezer([dzTrack(1, "LO QUE LE PASÓ A HAWAii", "Bad Bunny"), dzTrack(2, "Hawái", "Maluma")]),
  });
  assert.equal(v.tracks[0].externalId, "dz:2");
  assert.equal(v.top?.kind, "track");
});

test("el artista buscado es el resultado principal (perfil primero)", () => {
  const v = buildSearchView({
    ...base, query: "anuel",
    deezer: deezer([dzTrack(1, "Ahora Me Llama", "Anuel AA")], [{ id: 9, name: "Anuel AA", nb_fan: 5000000, picture_xl: "https://c/a.jpg" }]),
  });
  assert.equal(v.top?.kind, "artist");
  assert.equal(v.artists[0].name, "Anuel AA");
});

test("dedupe: misma canción en dos ediciones/fuentes → una", () => {
  const v = buildSearchView({ ...base, query: "hawai", deezer: deezer([dzTrack(2, "Hawái", "Maluma"), dzTrack(3, "Hawái (Remastered)", "Maluma")]) });
  assert.equal(v.tracks.length, 1);
});

test("un artista de VooXiE gana sobre el mismo nombre de Deezer", () => {
  const catalog = { tracks: [], albums: [], artists: [{ id: "uuid-1", display_name: "Feid", avatar_url: null, verified: true }] } as SearchResults;
  const v = buildSearchView({ query: "feid", catalog, fallback: null, audius: null,
    deezer: deezer([], [{ id: 5, name: "Feid", nb_fan: 100 }]) });
  assert.equal(v.artists.length, 1);
  assert.equal(v.artists[0].origin, "vooxie");
  assert.equal(v.artists[0].id, "uuid-1");
});

test("tracks propios con audio_url ganan al duplicado de Deezer", () => {
  const own = { id: "t1", title: "Hawái", audio_url: "https://s/a.mp3", youtube_id: null, artist: { id: "a", display_name: "Maluma", avatar_url: null, verified: false },
    duration_seconds: 100, resolvedCoverUrl: null } as unknown as Track;
  const catalog = { tracks: [own], artists: [], albums: [] } as SearchResults;
  const v = buildSearchView({ query: "hawai", catalog, fallback: null, audius: null, deezer: deezer([dzTrack(2, "Hawái", "Maluma")]) });
  assert.equal(v.tracks.length, 1);
  assert.equal((v.tracks[0] as Track).id, "t1");
});

test("respaldo de YouTube solo si Deezer no trae canciones", () => {
  const yt = { ...dzTrack(7, "Hawái cover", "Canal Random"), externalId: "AAAAAAAAAAA", deezerId: null };
  const withDz = buildSearchView({ ...base, query: "hawai", deezer: deezer([dzTrack(2, "Hawái", "Maluma")]), fallback: deezer([yt]) });
  assert.ok(!withDz.tracks.some((t) => (t as ExternalTrack).externalId === "AAAAAAAAAAA"));
  const withoutDz = buildSearchView({ ...base, query: "hawai", deezer: null, fallback: deezer([yt]) });
  assert.equal(withoutDz.tracks.length, 1);
});

test("Audius entra al final y máximo 3", () => {
  const au = (i: number): ExternalTrack => ({ ...dzTrack(100 + i, `Hawai remix ${i}`, `Dj ${i}`), source: "audius", externalId: `au${i}`, deezerId: null, streamRef: `https://s/${i}` });
  const v = buildSearchView({ ...base, query: "hawai", deezer: deezer([dzTrack(2, "Hawái", "Maluma")]), audius: deezer([au(1), au(2), au(3), au(4), au(5)]) });
  assert.equal((v.tracks[0] as ExternalTrack).externalId, "dz:2");
  assert.ok(v.tracks.filter((t) => (t as ExternalTrack).source === "audius").length <= 3);
});

test("máximo de canciones y álbumes sin duplicados", () => {
  const many = Array.from({ length: 30 }, (_, i) => dzTrack(i + 1, `Tema ${i}`, `Artista ${i}`));
  const v = buildSearchView({ ...base, query: "tema", deezer: deezer(many, [], [
    { id: 1, title: "Disco", artist: { id: 1, name: "A" } }, { id: 2, title: "Disco", artist: { id: 1, name: "A" } } ]), maxTracks: 8 });
  assert.equal(v.tracks.length, 8);
  assert.equal(v.albums.length, 1);
});

test("sin nada: vista vacía", () => {
  const v = buildSearchView({ ...base, query: "x", deezer: null });
  assert.deepEqual([v.top, v.tracks, v.artists, v.albums], [null, [], [], []]);
});
