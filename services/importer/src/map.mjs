/** Mapeos puros Deezer → filas de Supabase. Todo se valida: nada de undefined/basura a la BD. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISRC_RE = /^[A-Z0-9]{12}$/;

export function norm(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Mejor foto disponible; null si Deezer devuelve su imagen vacía por defecto. */
export function pickPicture(obj) {
  for (const key of ["picture_xl", "picture_big", "picture_medium", "picture"]) {
    const url = obj?.[key];
    if (typeof url === "string" && url.startsWith("https://") && !url.includes("/artist//")) return url;
  }
  return null;
}

export function pickCover(obj) {
  for (const key of ["cover_xl", "cover_big", "cover_medium", "cover"]) {
    const url = obj?.[key];
    if (typeof url === "string" && url.startsWith("https://") && !url.includes("/cover//") && !url.includes("/images//")) return url;
  }
  return null;
}

export function validDate(d) {
  return typeof d === "string" && DATE_RE.test(d) && !d.startsWith("0000") ? d : null;
}

export function albumType(recordType) {
  switch (String(recordType ?? "").toLowerCase()) {
    case "ep": return "ep";
    case "single": return "single";
    case "compile": case "compilation": return "compilation";
    default: return "album";
  }
}

export function mapArtist(d) {
  const name = String(d?.name ?? "").trim();
  if (!d?.id || !name) return null;
  return {
    deezer_id: Number(d.id),
    display_name: name.slice(0, 120),
    avatar_url: pickPicture(d),
    monthly_listeners: Number.isFinite(d.nb_fan) ? Math.max(0, Math.trunc(d.nb_fan)) : null,
  };
}

export function mapAlbum(d) {
  if (!d?.id || !String(d.title ?? "").trim()) return null;
  return {
    deezer_id: Number(d.id),
    title: String(d.title).trim().slice(0, 200),
    cover_url: pickCover(d),
    release_date: validDate(d.release_date),
    album_type: albumType(d.record_type),
  };
}

export function mapTrack(d, { albumCover = null, albumDate = null } = {}) {
  if (!d?.id || !String(d.title ?? "").trim()) return null;
  const isrc = typeof d.isrc === "string" ? d.isrc.toUpperCase() : null;
  return {
    deezer_id: Number(d.id),
    title: String(d.title).trim().slice(0, 200),
    duration_seconds: Number.isFinite(d.duration) && d.duration > 0 ? Math.trunc(d.duration) : 0,
    track_number: Number.isFinite(d.track_position) && d.track_position > 0 ? Math.trunc(d.track_position) : null,
    is_explicit: d.explicit_lyrics === true,
    isrc: isrc && ISRC_RE.test(isrc) ? isrc : null,
    release_date: validDate(d.release_date) ?? albumDate,
    cover_url: albumCover,
  };
}

/**
 * Participantes de una canción → [{ artist (mapArtist), role, position }].
 * Deezer marca cada contributor como "Main" o "Featured". El artista principal de
 * la canción siempre aparece como primary.
 */
export function mapContributors(trackDetail) {
  const out = [];
  const seen = new Set();
  const push = (raw, role) => {
    const artist = mapArtist(raw);
    if (!artist || seen.has(artist.deezer_id)) return;
    seen.add(artist.deezer_id);
    out.push({ artist, role, position: out.length });
  };
  if (trackDetail?.artist) push(trackDetail.artist, "primary");
  for (const c of trackDetail?.contributors ?? []) {
    push(c, String(c.role ?? "").toLowerCase() === "featured" ? "featured" : "primary");
  }
  if (out.length && !out.some((x) => x.role === "primary")) out[0].role = "primary";
  return out;
}
