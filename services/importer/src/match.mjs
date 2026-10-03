/**
 * Empareja una canción de Deezer con un resultado de YouTube (servicio yt-dlp).
 * El servicio ya filtra "solo música"; aquí se exige que coincidan título, artista y duración.
 */
import { norm } from "./map.mjs";

const MAX_DURATION_DIFF_S = 8;

function tokens(s) {
  return new Set(norm(s).split(" ").filter((t) => t.length > 1));
}

function overlap(a, b) {
  if (!a.size) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / a.size;
}

/** Quita "(feat. X)", "[Remastered]", etc. para comparar el título base. */
export function baseTitle(title) {
  return String(title ?? "").replace(/[\(\[][^\)\]]*[\)\]]/g, " ").replace(/\s+-\s+.*$/, " ");
}

export function scoreCandidate(want, cand) {
  const dur = want.duration && cand.duration ? Math.abs(want.duration - cand.duration) : null;
  if (dur !== null && dur > MAX_DURATION_DIFF_S) return -1;

  const titleScore = overlap(tokens(baseTitle(want.title)), tokens(baseTitle(cand.title)));
  if (titleScore < 0.6) return -1;

  const wantArtist = tokens(want.artist);
  const candText = new Set([...tokens(cand.artist), ...tokens(cand.title)]);
  const artistScore = overlap(wantArtist, candText);
  if (artistScore < 0.5) return -1;

  let score = titleScore * 3 + artistScore * 2;
  if (dur !== null) score += (MAX_DURATION_DIFF_S - dur) / MAX_DURATION_DIFF_S;
  if (/ - topic$/i.test(cand.artist ?? "")) score += 1.5;
  if (/vevo/i.test(cand.artist ?? "")) score += 0.5;
  if (/\b(live|en vivo|cover|remix|sped up|slowed|nightcore)\b/i.test(cand.title ?? "") &&
      !/\b(live|en vivo|cover|remix|sped up|slowed|nightcore)\b/i.test(want.title ?? "")) score -= 2;
  return score;
}

/** Devuelve el mejor candidato o null si ninguno es confiable. */
export function pickBest(want, candidates) {
  let best = null;
  let bestScore = -1;
  for (const c of candidates) {
    const s = scoreCandidate(want, c);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  return bestScore >= 3 ? best : null;
}
