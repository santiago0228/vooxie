import { supabase } from "../supabase/client";

/**
 * Subida a Supabase Storage para VooXiE Artistas.
 *
 * Usa EXCLUSIVAMENTE los buckets ya creados en la migración 0004:
 * artist-images, album-covers, track-audio. Las políticas de esa
 * migración exigen que el primer segmento de la ruta sea el
 * `artist_profiles.id` del dueño — por eso todas las rutas acá arman
 * `${artistId}/archivo`, o la subida falla por RLS.
 *
 * Devuelve la URL PÚBLICA completa (no una ruta relativa): el resto del
 * sistema (AudioEngine, catalogService) ya trata `audio_url`/`cover_url`
 * como URLs completas, sin ninguna resolución adicional — así que acá se
 * guarda exactamente lo que esas capas esperan, sin inventar un patrón
 * nuevo.
 */

export type UploadResult =
  | { ok: true; publicUrl: string; path: string }
  | { ok: false; message: string };

const GENERIC_UPLOAD_ERROR = "No pudimos subir el archivo. Inténtalo de nuevo.";

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

async function uploadLocalFile(
  bucket: "artist-images" | "album-covers" | "track-audio",
  path: string,
  localUri: string,
  contentType: string
): Promise<UploadResult> {
  try {
    // PASO 1 — Leer la URI local como Blob via XMLHttpRequest.
    //
    // fetch(localUri).blob() devuelve 0 bytes en React Native/Expo cuando
    // la URI proviene de expo-image-picker (ph://) o expo-document-picker
    // (file://). XHR con responseType="blob" pasa por el bridge nativo de
    // Expo, que sí tiene acceso al sistema de archivos y a la Photo Library,
    // obteniendo el Blob real con su tamaño correcto.
    const blob = await new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => resolve(xhr.response as Blob);
      xhr.onerror = () =>
        reject(new Error("No se pudo leer el archivo local."));
      xhr.responseType = "blob";
      xhr.open("GET", localUri);
      xhr.send();
    });

    // Guardia explícita: abortar antes de subir si el blob está vacío.
    if (blob.size === 0) {
      return {
        ok: false,
        message:
          "El archivo parece estar vacío o no se pudo leer. Intenta seleccionarlo de nuevo.",
      };
    }

    // PASO 2 — Convertir Blob → ArrayBuffer antes de pasar a Supabase.
    //
    // En React Native, pasar un Blob directamente a supabase.storage.upload()
    // envía 0 bytes al servidor: la implementación interna de @supabase/storage-js
    // serializa el body con fetch(), y fetch() en el runtime de Hermes/JSC no
    // puede leer el contenido interno de un Blob nativo que proviene del bridge
    // (es un objeto opaco desde la perspectiva del runtime JS).
    //
    // ArrayBuffer sí es un tipo primitivo del runtime JS — Hermes/JSC lo
    // tiene completamente en memoria y fetch() lo transmite byte a byte sin
    // depender del bridge. Por eso Blob → ArrayBuffer → upload() envía los
    // bytes reales al bucket de Supabase.
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () =>
        reject(new Error("No se pudo convertir el archivo para la subida."));
      reader.readAsArrayBuffer(blob);
    });

    const { error } = await supabase.storage.from(bucket).upload(path, arrayBuffer, {
      contentType,
      upsert: false,
    });

    if (error) {
      return { ok: false, message: error.message || GENERIC_UPLOAD_ERROR };
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { ok: true, publicUrl: data.publicUrl, path };
  } catch (e) {
    const msg = e instanceof Error ? e.message : GENERIC_UPLOAD_ERROR;
    return { ok: false, message: msg };
  }
}

/** Foto de perfil de artista (packages/core/artistProfileService la asocia después). */
export async function uploadArtistAvatar(
  artistId: string,
  localUri: string
): Promise<UploadResult> {
  const path = `${artistId}/avatar-${Date.now()}.jpg`;
  return uploadLocalFile("artist-images", path, localUri, "image/jpeg");
}

/** Portada de álbum/single/EP. */
export async function uploadAlbumCover(
  artistId: string,
  localUri: string
): Promise<UploadResult> {
  const path = `${artistId}/cover-${Date.now()}.jpg`;
  return uploadLocalFile("album-covers", path, localUri, "image/jpeg");
}

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
};

/**
 * Valida la extensión antes de intentar subir (sección 13: mp3/m4a/wav
 * como mínimo). No convierte formatos — si Expo/Supabase no lo soportan,
 * se lo decimos al artista en vez de intentar una conversión silenciosa.
 */
export function isSupportedAudioFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ext in AUDIO_MIME_BY_EXT;
}

export async function uploadTrackAudio(
  artistId: string,
  localUri: string,
  originalFileName: string
): Promise<UploadResult> {
  const ext = originalFileName.split(".").pop()?.toLowerCase() ?? "mp3";
  if (!(ext in AUDIO_MIME_BY_EXT)) {
    return {
      ok: false,
      message: "Formato no compatible. Usa MP3, M4A o WAV.",
    };
  }
  const safeName = sanitizeFileName(originalFileName);
  const path = `${artistId}/${Date.now()}-${safeName}`;
  return uploadLocalFile("track-audio", path, localUri, AUDIO_MIME_BY_EXT[ext]);
}
