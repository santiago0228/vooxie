/**
 * Importador: Deezer → catálogo de VooXiE.
 *
 *   artista ─ álbumes ─ canciones ─ colaboradores (primary/featured)
 *                          └─ youtube_id (emparejado vía servicio yt-dlp)
 *
 * Una canción SIN audio emparejado NO se inserta (la tabla exige una fuente de audio);
 * se cuenta como `noAudio` y se reintenta al volver a ejecutar el importador.
 * Es idempotente: re-ejecutar actualiza, no duplica (índices únicos por deezer_id).
 */
import { mapAlbum, mapArtist, mapContributors, mapTrack, norm } from "./map.mjs";

export async function resolveArtist(deezer, ref, log = () => {}) {
  if (ref.deezerId) return deezer.getArtist(ref.deezerId);
  const results = await deezer.searchArtists(ref.name);
  if (!results.length) return null;
  const wanted = norm(ref.name);
  const exact = results.filter((r) => norm(r.name) === wanted);
  const pool = exact.length ? exact : results;
  const chosen = [...pool].sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0))[0];
  if (!exact.length) log(`Sin coincidencia exacta para "${ref.name}"; usando "${chosen.name}".`);
  return deezer.getArtist(chosen.id);
}

export async function importArtist({ deezer, db, matcher = null, log = () => {} }, ref, options = {}) {
  const opts = { maxAlbums: 60, maxTracks: 400, includeTop: true, ...options };
  const stats = { albums: 0, tracks: 0, noAudio: 0, failed: 0, artists: new Set() };

  const detail = await resolveArtist(deezer, ref, log);
  if (!detail) throw new Error(`No se encontró el artista "${ref.name}" en Deezer.`);
  const artistRow = mapArtist(detail);
  if (!artistRow) throw new Error("Deezer devolvió un artista inválido.");

  const mainArtistId = await db.upsertArtist(artistRow, { full: true });
  stats.artists.add(artistRow.deezer_id);
  log(`Artista: ${artistRow.display_name} (deezer ${artistRow.deezer_id}, ${artistRow.monthly_listeners ?? "?"} fans)` +
      (artistRow.avatar_url ? "" : " — sin foto en Deezer"));

  const doneTracks = new Set();
  const albumIds = new Map(); // deezer album id → id en BD

  async function ensureArtist(raw) {
    // Acepta el objeto crudo de Deezer o una fila ya mapeada (participantes de una canción).
    const row = raw?.deezer_id != null ? raw : mapArtist(raw);
    if (!row) return null;
    const id = await db.upsertArtist(row, { full: false });
    stats.artists.add(row.deezer_id);
    return { id, row };
  }

  async function ensureAlbum(albumRaw, artistDbId) {
    const row = mapAlbum(albumRaw);
    if (!row) return null;
    if (albumIds.has(row.deezer_id)) return albumIds.get(row.deezer_id);
    const id = await db.upsertAlbum({ ...row, artist_id: artistDbId });
    albumIds.set(row.deezer_id, id);
    stats.albums++;
    return id;
  }

  async function importTrack(trackId, ctx = {}) {
    if (doneTracks.has(trackId) || doneTracks.size >= opts.maxTracks) return;
    doneTracks.add(trackId);
    try {
      const t = await deezer.getTrack(trackId);
      const row = mapTrack(t, ctx);
      const people = mapContributors(t);
      if (!row || !people.length) { stats.failed++; return; }

      const primaryName = people.find((p) => p.role === "primary").artist.display_name;
      const existing = await db.findTrack(row.deezer_id);
      let youtubeId = existing?.youtube_id ?? null;
      if (!youtubeId && matcher) {
        const hit = await matcher.find({ title: row.title, artist: primaryName, duration: row.duration_seconds });
        youtubeId = hit?.videoId ?? null;
      }
      if (!youtubeId) {
        stats.noAudio++;
        log(`  ✗ sin audio: ${primaryName} — ${row.title}`);
        return;
      }

      const resolved = [];
      for (const p of people) {
        const a = await ensureArtist(p.artist);
        if (a) resolved.push({ artistId: a.id, role: p.role, position: p.position });
      }
      if (!resolved.length) { stats.failed++; return; }
      const primary = resolved.find((r) => r.role === "primary") ?? resolved[0];

      let albumDbId = ctx.albumDbId ?? null;
      if (!albumDbId && t.album) albumDbId = await ensureAlbum(t.album, primary.artistId);

      const dbId = await db.upsertTrack({
        ...row,
        artist_id: primary.artistId,
        album_id: albumDbId,
        youtube_id: youtubeId,
        status: "published",
      });
      await db.setTrackArtists(dbId, resolved);
      stats.tracks++;
      log(`  ✓ ${primaryName} — ${row.title}${resolved.length > 1 ? ` (+${resolved.length - 1})` : ""}`);
    } catch (e) {
      stats.failed++;
      log(`  ! error en track ${trackId}: ${e.message}`);
    }
  }

  async function importAlbum(albumRef) {
    const album = await deezer.getAlbum(albumRef.id);
    const primary = await ensureArtist(album.artist ?? detail);
    if (!primary) return;
    const albumDbId = await ensureAlbum(album, primary.id);
    if (!albumDbId) return;
    const albumRow = mapAlbum(album);
    log(`Álbum: ${albumRow.title} [${albumRow.album_type}] ${albumRow.release_date ?? ""}`);
    for (const t of album.tracks?.data ?? []) {
      await importTrack(t.id, { albumDbId, albumCover: albumRow.cover_url, albumDate: albumRow.release_date });
    }
  }

  // 1) Discografía (más recientes primero)
  const albums = (await deezer.getArtistAlbums(detail.id, opts.maxAlbums)).slice();
  albums.sort((a, b) => String(b.release_date ?? "").localeCompare(String(a.release_date ?? "")));
  for (const a of albums.slice(0, opts.maxAlbums)) {
    try { await importAlbum(a); } catch (e) { stats.failed++; log(`! álbum ${a.id}: ${e.message}`); }
  }

  // 2) Canciones top (incluye colaboraciones en discos de otros artistas)
  if (opts.includeTop) {
    log("Canciones destacadas y colaboraciones…");
    for (const t of await deezer.getArtistTop(detail.id, 100)) await importTrack(t.id);
  }

  return { artistId: mainArtistId, name: artistRow.display_name, stats: { ...stats, artists: stats.artists.size } };
}
