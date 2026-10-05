/**
 * LyricsService — capa de abstracción para obtención de letras.
 *
 * Prioridad:
 *   1. Letras propias de VOOXIE (campo futuro: vooxieLyrics en Track)
 *      → Se conectará desde la Fase 3/VOOXIE Artistas cuando el schema
 *        tenga el campo lyrics en la tabla tracks.
 *   2. LRCLIB (proveedor gratuito, sin API key, soporta letras sincronizadas LRC)
 *   3. "Letra no disponible" (array vacío → LyricsView muestra el mensaje)
 *
 * LIMPIEZA DE TÍTULOS:
 *   Los títulos de YouTube tienen sufijos que rompen la búsqueda:
 *   "(Video Oficial)", "(Official Video)", "Lyrics", "Visualizer", etc.
 *   Los limpiamos antes de buscar pero conservando información relevante.
 *
 * SINCRONIZACIÓN:
 *   - Letras LRC (con timestamps): highlight de línea actual basado en positionSeconds.
 *   - Letras planas: mostradas sin sincronización (startSeconds/endSeconds = 0).
 *   - LyricsView lee positionSeconds directamente del store — no depende de props.
 *
 * CACHÉ: por clave "artist|title_limpio" — evita re-fetch al cambiar de modo.
 */

export type LyricsLine = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

type FetchParams = {
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  /** Campo futuro: letras oficiales VOOXIE cargadas por el artista */
  vooxieLyrics?: string | null;
};

// Caché en memoria (clave: "artist|title")
const cache = new Map<string, LyricsLine[]>();

// ─── Limpieza de título ────────────────────────────────────────────────────────

/**
 * Limpia sufijos y etiquetas innecesarias de títulos de YouTube para mejorar
 * la coincidencia con bases de datos de letras.
 *
 * Elimina:
 *   - (Video Oficial) / (Official Video) / (Music Video) / (Official Music Video)
 *   - (Lyric Video) / (Lyrics) / (Letra)
 *   - (Visualizer) / (Visualizador) / (Official Audio)
 *   - (HD) / (4K) / (HQ)
 *   - [Prod. by X] / [Produced by X]
 *
 * Conserva:
 *   - Feat. / ft. (información de artistas)
 *   - Remix / Version (información de versión)
 *   - Año si va solo
 */
function cleanTitle(raw: string): string {
  return raw
    // Paréntesis comunes de YouTube
    .replace(/\s*\(?\s*(video\s+oficial|official\s+video|music\s+video|official\s+music\s+video)\s*\)?\s*/gi, " ")
    .replace(/\s*\(?\s*(lyric\s+video|lyrics|letra|visualizer|visualizador|official\s+audio|audio\s+oficial)\s*\)?\s*/gi, " ")
    .replace(/\s*\(?\s*(hd|4k|hq|full\s+hd)\s*\)?\s*/gi, " ")
    // Corchetes de producción
    .replace(/\s*\[\s*(prod\.?|produced\s+by)[^\]]*\]\s*/gi, " ")
    // Canal/marca
    .replace(/\s*\|\s*[A-Z][^\|]*$/g, "")
    // Múltiples espacios
    .replace(/\s+/g, " ")
    .trim();
}

/** Normaliza artista: quita canales de letras como "LYRICS PREMIUM" */
function cleanArtist(raw: string): string {
  if (/lyrics?\s*(premium|channel|hd|official)/i.test(raw)) return "";
  return raw.trim();
}

// ─── Parser LRC ───────────────────────────────────────────────────────────────

function parseLRC(lrc: string, totalDuration: number): LyricsLine[] {
  const lines: { t: number; text: string }[] = [];
  const lineRE = /\[(\d{2,3}):(\d{2})\.(\d{2,3})\](.*)/;
  for (const raw of lrc.split("\n")) {
    const m = lineRE.exec(raw.trim());
    if (!m) continue;
    const t =
      parseInt(m[1]) * 60 +
      parseInt(m[2]) +
      parseInt(m[3]) / (m[3].length === 3 ? 1000 : 100);
    const text = m[4].trim();
    if (text) lines.push({ t, text });
  }
  lines.sort((a, b) => a.t - b.t);
  return lines.map((l, i) => ({
    startSeconds: l.t,
    endSeconds: lines[i + 1]?.t ?? totalDuration,
    text: l.text,
  }));
}

function parsePlainLyrics(plain: string): LyricsLine[] {
  return plain
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text) => ({ startSeconds: 0, endSeconds: 0, text }));
}

// ─── LRCLIB ───────────────────────────────────────────────────────────────────

async function fetchFromLRCLIB(
  title: string,
  artist: string,
  album?: string,
  duration?: number
): Promise<LyricsLine[]> {
  const cleanedTitle = cleanTitle(title);
  const cleanedArtist = cleanArtist(artist);

  if (!cleanedArtist) {
    // Sin artista válido, imposible buscar
    return [];
  }

  try {
    const params = new URLSearchParams({
      track_name: cleanedTitle,
      artist_name: cleanedArtist,
    });
    if (album) params.set("album_name", album);
    if (duration && duration > 30) params.set("duration", String(Math.round(duration)));

    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { "Lrclib-Client": "VOOXIE/1.0 (https://vooxie.app)" },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      // Intentar sin duración si falló con duración (duración puede diferir)
      if (duration && res.status === 404) {
        const params2 = new URLSearchParams({
          track_name: cleanedTitle,
          artist_name: cleanedArtist,
        });
        const res2 = await fetch(`https://lrclib.net/api/get?${params2}`, {
          headers: { "Lrclib-Client": "VOOXIE/1.0 (https://vooxie.app)" },
          signal: AbortSignal.timeout(5000),
        });
        if (!res2.ok) return [];
        const data2 = await res2.json();
        if (data2.syncedLyrics) return parseLRC(data2.syncedLyrics, duration ?? 0);
        if (data2.plainLyrics) return parsePlainLyrics(data2.plainLyrics);
      }
      return [];
    }

    const data = await res.json();
    if (data.syncedLyrics) return parseLRC(data.syncedLyrics, duration ?? 0);
    if (data.plainLyrics) return parsePlainLyrics(data.plainLyrics);
  } catch {
    // Timeout, network error — silencioso
  }
  return [];
}

// ─── API pública ──────────────────────────────────────────────────────────────

export const LyricsService = {
  async fetch(params: FetchParams): Promise<LyricsLine[]> {
    const cleanedTitle = cleanTitle(params.title);
    const key = `${params.artist.toLowerCase()}|${cleanedTitle.toLowerCase()}`;

    if (cache.has(key)) return cache.get(key)!;

    let result: LyricsLine[] = [];

    // 1. Letras propias VOOXIE (campo futuro)
    if (params.vooxieLyrics) {
      result = parsePlainLyrics(params.vooxieLyrics);
    }

    // 2. LRCLIB
    if (result.length === 0) {
      result = await fetchFromLRCLIB(
        params.title, // pasamos el original — cleanTitle se aplica internamente
        params.artist,
        params.album,
        params.durationSeconds
      );
    }

    // 3. Array vacío → LyricsView muestra "Letra no disponible"
    cache.set(key, result);
    return result;
  },

  clearCache() {
    cache.clear();
  },
};
