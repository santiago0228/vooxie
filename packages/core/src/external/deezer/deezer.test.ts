// Ejecutar:  npx tsx --test packages/core/src/external/deezer/deezer.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { __setDeezerFetch, deezerGet } from "./client.ts";
import { getDeezerAlbum, getDeezerArtist, parseDeezerId } from "./deezerCatalog.ts";
import { dedupeTracks, searchDeezer } from "./deezerSearch.ts";
import { mapDeezerAlbum, mapDeezerArtist, mapDeezerTrack, pickPicture } from "./mapper.ts";

const EMPTY = "https://cdn.dz/images/artist//1000x1000.jpg";
const MALUMA = { id: 5, name: "Maluma", picture_xl: "https://cdn.dz/maluma.jpg", nb_fan: 9000000 };
const TRACK = {
  id: 100, title: "Hawái", title_short: "Hawái", duration: 200, rank: 900000, explicit_lyrics: false, readable: true,
  artist: MALUMA, album: { id: 50, title: "Papi Juancho", cover_xl: "https://cdn.dz/pj_xl.jpg", cover_medium: "https://cdn.dz/pj_m.jpg" },
};

const fakeFetch = (routes: Record<string, unknown>, calls: string[] = []) => async (url: string) => {
  calls.push(url);
  const path = new URL(url).pathname;
  const body = routes[path];
  if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => body };
};

test("mapDeezerTrack: id dz:, metadata oficial, portada del álbum, sin stream aún", () => {
  const t = mapDeezerTrack(TRACK)!;
  assert.equal(t.externalId, "dz:100");
  assert.equal(t.deezerId, 100);
  assert.equal(t.title, "Hawái");
  assert.equal(t.artist.name, "Maluma");
  assert.equal(t.artwork?.large, "https://cdn.dz/pj_xl.jpg");
  assert.equal(t.durationSeconds, 200);
  assert.equal(t.streamRef, "");
  assert.equal(t.streamUrl, null);
  assert.equal(t.albumTitle, "Papi Juancho");
});

test("mapDeezerTrack: descarta inválidos y no legibles", () => {
  assert.equal(mapDeezerTrack(null), null);
  assert.equal(mapDeezerTrack({ id: 1, title: "x" }), null);
  assert.equal(mapDeezerTrack({ ...TRACK, readable: false }), null);
  assert.equal(mapDeezerTrack({ ...TRACK, artist: { id: 1, name: "" } }), null);
});

test("pickPicture: la imagen vacía por defecto de Deezer es null", () => {
  assert.equal(pickPicture({ picture_xl: EMPTY }), null);
  assert.equal(mapDeezerArtist({ id: 9, name: "X", picture_xl: EMPTY })!.avatarUrl, null);
  assert.equal(mapDeezerArtist(MALUMA)!.followerCount, 9000000);
});

test("mapDeezerAlbum: tipo y fecha válidas", () => {
  const a = mapDeezerAlbum({ id: 1, title: "EP X", record_type: "ep", release_date: "2024-02-02", artist: MALUMA, nb_tracks: 5 })!;
  assert.equal(a.albumType, "ep");
  assert.equal(a.releaseDate, "2024-02-02");
  assert.equal(mapDeezerAlbum({ id: 1, title: "X", release_date: "0000-00-00" })!.releaseDate, null);
});

test("dedupeTracks: misma canción/artista en otra edición se quita", () => {
  const a = mapDeezerTrack(TRACK)!;
  const b = mapDeezerTrack({ ...TRACK, id: 101, title: "Hawái (Remastered)" })!;
  assert.equal(dedupeTracks([a, b]).length, 1);
});

test("searchDeezer: canciones, artistas y álbumes en paralelo; sin duplicados", async () => {
  const calls: string[] = [];
  __setDeezerFetch(fakeFetch({
    "/search/track": { data: [TRACK, { ...TRACK, id: 101, title: "Hawái (Remastered)" }, { ...TRACK, id: 102, title: "Otra", artist: { id: 7, name: "Otro" } }] },
    "/search/artist": { data: [MALUMA] },
    "/search/album": { data: [{ id: 50, title: "Papi Juancho", record_type: "album", artist: MALUMA }] },
  }, calls));
  const r = await searchDeezer("hawai", 10);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.data.tracks.map((t) => t.title), ["Hawái", "Otra"]);
  assert.equal(r.data.artists[0].name, "Maluma");
  assert.equal(r.data.albums[0].title, "Papi Juancho");
  assert.equal(calls.length, 3);
  assert.ok(calls.every((u) => u.startsWith("https://api.deezer.com/")));
});

test("searchDeezer: query vacía no llama a la red; todo falla → error", async () => {
  const calls: string[] = [];
  __setDeezerFetch(fakeFetch({}, calls));
  const empty = await searchDeezer("   ");
  assert.ok(empty.ok && empty.data.tracks.length === 0);
  assert.equal(calls.length, 0);
  const bad = await searchDeezer("algo");
  assert.equal(bad.ok, false);
});

test("deezerGet: caché por URL y error de la API con HTTP 200", async () => {
  const calls: string[] = [];
  __setDeezerFetch(fakeFetch({ "/x": { a: 1 }, "/err": { error: { code: 4, message: "Quota" } } }, calls));
  await deezerGet("/x"); await deezerGet("/x");
  assert.equal(calls.length, 1);
  await assert.rejects(deezerGet("/err"), /rechazó/);
});

test("getDeezerArtist: perfil, top y discografía (más recientes primero)", async () => {
  __setDeezerFetch(fakeFetch({
    "/artist/5": MALUMA,
    "/artist/5/top": { data: [TRACK] },
    "/artist/5/albums": { data: [
      { id: 1, title: "Viejo", release_date: "2015-01-01", record_type: "album" },
      { id: 2, title: "Nuevo", release_date: "2024-01-01", record_type: "single" },
    ] },
  }));
  const d = (await getDeezerArtist(5))!;
  assert.equal(d.artist.name, "Maluma");
  assert.equal(d.topTracks.length, 1);
  assert.deepEqual(d.albums.map((a) => a.title), ["Nuevo", "Viejo"]);
  assert.equal(d.albums[0].artist.name, "Maluma");
});

test("getDeezerAlbum: pistas con portada y artista del álbum", async () => {
  __setDeezerFetch(fakeFetch({
    "/album/50": { id: 50, title: "Papi Juancho", cover_xl: "https://cdn.dz/pj_xl.jpg", cover_medium: "https://cdn.dz/pj_m.jpg", record_type: "album", artist: MALUMA,
      tracks: { data: [{ id: 100, title: "Hawái", duration: 200 }, { id: 103, title: "Madrid", duration: 190, artist: { id: 5, name: "Maluma" } }] } },
  }));
  const d = (await getDeezerAlbum(50))!;
  assert.equal(d.tracks.length, 2);
  assert.equal(d.tracks[0].artist.name, "Maluma");
  assert.equal(d.tracks[0].artwork?.large, "https://cdn.dz/pj_xl.jpg");
  assert.equal(d.tracks[0].albumTitle, "Papi Juancho");
});

test("parseDeezerId", () => {
  assert.equal(parseDeezerId("dz:artist:5", "artist"), 5);
  assert.equal(parseDeezerId("dz:album:50", "album"), 50);
  assert.equal(parseDeezerId("dz:100", "track"), 100);
  assert.equal(parseDeezerId("abc", "artist"), null);
  assert.equal(parseDeezerId("dz:artist:x", "artist"), null);
});
