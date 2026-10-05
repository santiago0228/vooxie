import test from "node:test";
import assert from "node:assert/strict";
import { createDeezerClient, DeezerError } from "../src/deezer.mjs";
import { importArtist } from "../src/importer.mjs";
import { mapAlbum, mapArtist, mapContributors, mapTrack, pickPicture } from "../src/map.mjs";
import { pickBest, scoreCandidate } from "../src/match.mjs";

// ─── Datos de ejemplo con la forma de la API de Deezer ───────────────────────
const EMPTY_PIC = "https://cdn-images.dzcdn.net/images/artist//1000x1000-000000-80-0-0.jpg";
const ANUEL = { id: 1, name: "Anuel AA", picture_xl: "https://img/anuel.jpg", nb_fan: 5000000 };
const KAROL = { id: 2, name: "Karol G", picture_xl: "https://img/karol.jpg", nb_fan: 9000000 };
const NOPIC = { id: 3, name: "Productor X", picture_xl: EMPTY_PIC };

const TRACKS = {
  101: { id: 101, title: "Ahora Me Llama", duration: 200, isrc: "USUM71800001", release_date: "2018-07-17", track_position: 1, explicit_lyrics: true,
    artist: ANUEL, contributors: [{ ...ANUEL, role: "Main" }, { ...KAROL, role: "Featured" }], album: { id: 10, title: "Real Hasta la Muerte", cover_xl: "https://img/rhlm.jpg", release_date: "2018-07-17", record_type: "album" } },
  102: { id: 102, title: "Sin Audio Aqui", duration: 180, isrc: "USUM71800002", release_date: "2018-07-17", track_position: 2, artist: ANUEL, contributors: [{ ...ANUEL, role: "Main" }], album: { id: 10, title: "Real Hasta la Muerte" } },
  201: { id: 201, title: "Colab Famosa", duration: 190, isrc: "ES1234500001", release_date: "2024-02-02", artist: KAROL, contributors: [{ ...KAROL, role: "Main" }, { ...ANUEL, role: "Featured" }, { ...NOPIC, role: "Featured" }], album: { id: 20, title: "Mañana Será Bonito", cover_xl: "https://img/msb.jpg", release_date: "2023-02-24", record_type: "album" } },
};
const ALBUMS = {
  10: { id: 10, title: "Real Hasta la Muerte", cover_xl: "https://img/rhlm.jpg", release_date: "2018-07-17", record_type: "album", artist: ANUEL,
    tracks: { data: [{ id: 101, title: "Ahora Me Llama" }, { id: 102, title: "Sin Audio Aqui" }] } },
};

function mockFetch(calls = []) {
  return async (url) => {
    calls.push(url);
    const u = new URL(url);
    const p = u.pathname;
    const json = (body) => ({ status: 200, json: async () => body });
    if (p === "/search/artist") return json({ data: [{ id: 99, name: "Anuel AA Tribute", nb_fan: 10 }, ANUEL] });
    if (p === "/artist/1") return json(ANUEL);
    if (p === "/artist/1/albums") return json({ data: [{ id: 10 }] });
    if (p === "/artist/1/top") return json({ data: [{ id: 201 }, { id: 101 }] });
    if (p.startsWith("/album/")) return json(ALBUMS[p.split("/")[2]]);
    if (p.startsWith("/track/")) { const t = TRACKS[p.split("/")[2]]; return json(t ?? { error: { code: 800, message: "no data" } }); }
    return { status: 404, json: async () => ({}) };
  };
}

function memDb() {
  const s = { artists: new Map(), albums: new Map(), tracks: new Map(), links: new Map() };
  let n = 0;
  const id = (p) => `${p}-${++n}`;
  return {
    s,
    async upsertArtist(row, { full }) {
      const ex = [...s.artists.values()].find((a) => a.deezer_id === row.deezer_id);
      if (ex) { if (!ex.avatar_url && row.avatar_url) ex.avatar_url = row.avatar_url; if (full) ex.monthly_listeners = row.monthly_listeners; return ex.id; }
      const a = { id: id("art"), origin: "catalog", ...row }; s.artists.set(a.id, a); return a.id;
    },
    async upsertAlbum(row) {
      const ex = [...s.albums.values()].find((a) => a.deezer_id === row.deezer_id);
      if (ex) return ex.id; const a = { id: id("alb"), ...row }; s.albums.set(a.id, a); return a.id;
    },
    async findTrack(d) { const t = [...s.tracks.values()].find((x) => x.deezer_id === d); return t ? { id: t.id, youtube_id: t.youtube_id } : null; },
    async upsertTrack(row) {
      const ex = [...s.tracks.values()].find((x) => x.deezer_id === row.deezer_id);
      if (ex) { Object.assign(ex, row, { youtube_id: ex.youtube_id ?? row.youtube_id }); return ex.id; }
      assert.ok(row.youtube_id, "nunca se inserta un track sin youtube_id");
      const t = { id: id("trk"), ...row }; s.tracks.set(t.id, t); return t.id;
    },
    async setTrackArtists(trackId, list) { s.links.set(trackId, list); },
  };
}

const matcher = {
  async find({ title }) {
    if (title === "Sin Audio Aqui") return null;
    return { videoId: "dQw4w9WgXcQ".slice(0, 10) + title.length % 10 };
  },
};

// ─── Tests ───────────────────────────────────────────────────────────────────
test("mapArtist / pickPicture: foto vacía de Deezer => null; fans => oyentes", () => {
  assert.equal(pickPicture(NOPIC), null);
  assert.equal(mapArtist(ANUEL).monthly_listeners, 5000000);
  assert.equal(mapArtist(NOPIC).avatar_url, null);
  assert.equal(mapArtist({ id: 1, name: "  " }), null);
});

test("mapAlbum: tipo, fecha inválida => null", () => {
  assert.equal(mapAlbum({ id: 1, title: "X", record_type: "ep", release_date: "0000-00-00" }).release_date, null);
  assert.equal(mapAlbum({ id: 1, title: "X", record_type: "ep" }).album_type, "ep");
  assert.equal(mapAlbum({ id: 1, title: "X", record_type: "compile" }).album_type, "compilation");
  assert.equal(mapAlbum({ id: 1, title: "X", record_type: "algo" }).album_type, "album");
});

test("mapTrack: isrc inválido => null, explícito, hereda portada y fecha", () => {
  const t = mapTrack({ id: 5, title: "T", duration: 120, isrc: "bad", explicit_lyrics: true }, { albumCover: "https://c", albumDate: "2020-01-01" });
  assert.equal(t.isrc, null); assert.equal(t.is_explicit, true);
  assert.equal(t.cover_url, "https://c"); assert.equal(t.release_date, "2020-01-01");
});

test("mapContributors: principal + feat, sin duplicados", () => {
  const p = mapContributors(TRACKS[101]);
  assert.deepEqual(p.map((x) => [x.artist.display_name, x.role]), [["Anuel AA", "primary"], ["Karol G", "featured"]]);
});

test("match: duración, título y artista deben coincidir", () => {
  const want = { title: "Ahora Me Llama", artist: "Anuel AA", duration: 200 };
  const good = { videoId: "AAAAAAAAAAA", title: "Ahora Me Llama", artist: "Anuel AA - Topic", duration: 201 };
  const wrongDur = { videoId: "BBBBBBBBBBB", title: "Ahora Me Llama", artist: "Anuel AA", duration: 260 };
  const wrongSong = { videoId: "CCCCCCCCCCC", title: "Otra Cancion Distinta", artist: "Anuel AA", duration: 200 };
  const live = { videoId: "DDDDDDDDDDD", title: "Ahora Me Llama (Live)", artist: "Fan", duration: 200 };
  assert.equal(scoreCandidate(want, wrongDur), -1);
  assert.equal(scoreCandidate(want, wrongSong), -1);
  assert.equal(pickBest(want, [wrongDur, wrongSong, live, good]).videoId, "AAAAAAAAAAA");
  assert.equal(pickBest(want, [wrongDur, wrongSong]), null);
});

test("Deezer client: reintenta cuota (code 4) y lanza errores reales", async () => {
  let n = 0;
  const f = async () => (++n < 3 ? { status: 200, json: async () => ({ error: { code: 4, message: "Quota" } }) } : { status: 200, json: async () => ({ ok: 1 }) });
  const c = createDeezerClient({ fetchImpl: f, sleep: async () => {}, minIntervalMs: 0 });
  assert.deepEqual(await c.getJson("/x"), { ok: 1 });
  assert.equal(n, 3);
  const bad = createDeezerClient({ fetchImpl: async () => ({ status: 200, json: async () => ({ error: { code: 800, message: "no data" } }) }), sleep: async () => {}, minIntervalMs: 0 });
  await assert.rejects(bad.getJson("/y"), (e) => e instanceof DeezerError && e.code === 800);
});

test("importArtist: artista, álbum, canciones, feats, colaboraciones y sin-audio", async () => {
  const db = memDb();
  const deezer = createDeezerClient({ fetchImpl: mockFetch(), sleep: async () => {}, minIntervalMs: 0 });
  const r = await importArtist({ deezer, db, matcher }, { name: "Anuel AA" });

  assert.equal(r.name, "Anuel AA");
  const artists = [...db.s.artists.values()];
  assert.equal(artists.find((a) => a.display_name === "Anuel AA").monthly_listeners, 5000000);
  assert.equal(artists.find((a) => a.display_name === "Anuel AA").avatar_url, "https://img/anuel.jpg");
  assert.equal(artists.find((a) => a.display_name === "Productor X").avatar_url, null);
  assert.ok(artists.every((a) => a.origin === "catalog"));

  const tracks = [...db.s.tracks.values()];
  assert.deepEqual(tracks.map((t) => t.title).sort(), ["Ahora Me Llama", "Colab Famosa"]);
  assert.ok(tracks.every((t) => /^[A-Za-z0-9_-]{11}$/.test(t.youtube_id) && t.status === "published"));
  assert.equal(r.stats.noAudio, 1);

  // "Ahora Me Llama": álbum propio + Karol G como feat
  const ahora = tracks.find((t) => t.title === "Ahora Me Llama");
  const alb = db.s.albums.get(ahora.album_id);
  assert.equal(alb.title, "Real Hasta la Muerte");
  assert.equal(ahora.track_number, 1); assert.equal(ahora.is_explicit, true);
  assert.deepEqual(db.s.links.get(ahora.id).map((l) => l.role), ["primary", "featured"]);

  // Colaboración en disco de otro artista: pertenece a Karol G; Anuel aparece como feat
  const colab = tracks.find((t) => t.title === "Colab Famosa");
  assert.equal(db.s.artists.get(colab.artist_id).display_name, "Karol G");
  assert.equal(db.s.albums.get(colab.album_id).title, "Mañana Será Bonito");
  const roles = db.s.links.get(colab.id).map((l) => [db.s.artists.get(l.artistId).display_name, l.role]);
  assert.deepEqual(roles, [["Karol G", "primary"], ["Anuel AA", "featured"], ["Productor X", "featured"]]);
});

test("importArtist es idempotente (re-ejecutar no duplica)", async () => {
  const db = memDb();
  const deezer = createDeezerClient({ fetchImpl: mockFetch(), sleep: async () => {}, minIntervalMs: 0 });
  await importArtist({ deezer, db, matcher }, { name: "Anuel AA" });
  const counts = () => [db.s.artists.size, db.s.albums.size, db.s.tracks.size];
  const before = counts();
  await importArtist({ deezer, db, matcher }, { name: "Anuel AA" });
  assert.deepEqual(counts(), before);
});

test("--no-match: sin matcher no se inserta ninguna canción (no hay audio) pero no falla", async () => {
  const db = memDb();
  const deezer = createDeezerClient({ fetchImpl: mockFetch(), sleep: async () => {}, minIntervalMs: 0 });
  const r = await importArtist({ deezer, db, matcher: null }, { name: "Anuel AA" });
  assert.equal(db.s.tracks.size, 0);
  assert.ok(r.stats.noAudio >= 2);
});

test("artista inexistente => error claro", async () => {
  const f = async () => ({ status: 200, json: async () => ({ data: [] }) });
  const deezer = createDeezerClient({ fetchImpl: f, sleep: async () => {}, minIntervalMs: 0 });
  await assert.rejects(importArtist({ deezer, db: memDb(), matcher }, { name: "Nadie" }), /No se encontró/);
});
