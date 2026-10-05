/**
 * AudioEngine — ÚNICO motor de reproducción (expo-audio).
 *
 *   PlayableItem ──▶ URL de audio ──▶ expo-audio ──▶ sonido
 *
 * Qué hace:   reproducir una URL, pausar, seek, reportar progreso/estado.
 * Qué NO hace: buscar, extraer audio, llamar a yt-dlp / youtube-proxy / YouTube,
 *              obtener o guardar metadata, decidir qué canción corresponde.
 *
 * URL que reproduce:
 *   · vooxie  → audio_url (Supabase Storage)
 *   · audius  → streamRef (URL de stream)
 *   · youtube → UnifiedTrack.streamUrl, SOLO si es válido. Si falta o expiró,
 *               el player espera: el TrackResolver (nivel superior) lo renueva.
 *
 * Un solo AudioPlayer: `useAudioPlayer` crea un reproductor nuevo (y libera el
 * anterior) cuando cambia la URL, así que cambios rápidos A→B→C nunca dejan dos
 * players vivos. Cada efecto verifica `loadKey` para ignorar callbacks obsoletos.
 *
 * Si el stream falla en reproducción, el engine NO contacta a nadie: informa
 * (`_reportPlaybackError`) y el nivel superior resuelve un stream nuevo.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { usePlayerStore, type PlayerState } from "./usePlayerStore";
import {
  getItemArtistName,
  getItemCoverUrl,
  getItemDuration,
  getItemId,
  getItemSource,
  getItemStreamRef,
  getItemTitle,
  isExternalTrack,
  type PlayableItem,
} from "./PlayableItem";
import { getPlayableUri } from "./getPlayableUri";

export { getPlayableUri };

const START_DELAY_MS = 150;
/** Si el recurso no carga ni suena en este tiempo, se trata como fallo del stream. */
const LOAD_TIMEOUT_MS = 25_000;

export function AudioEngine() {
  const currentTrack = usePlayerStore((s: PlayerState) => s.currentTrack);
  const status = usePlayerStore((s: PlayerState) => s.status);
  const seekRequest = usePlayerStore((s: PlayerState) => s.seekRequest);
  const resumeAtSeconds = usePlayerStore((s: PlayerState) => s.resumeAtSeconds);
  const retryNonce = usePlayerStore((s: PlayerState) => s.retryNonce);
  const reportStatus = usePlayerStore((s: PlayerState) => s._reportStatus);
  const reportProgress = usePlayerStore((s: PlayerState) => s._reportProgress);
  const clearSeekRequest = usePlayerStore((s: PlayerState) => s._clearSeekRequest);
  const clearResumeAt = usePlayerStore((s: PlayerState) => s._clearResumeAt);
  const reportPlaybackError = usePlayerStore((s: PlayerState) => s._reportPlaybackError);
  const onTrackFinished = usePlayerStore((s: PlayerState) => s._onTrackFinished);

  const trackId = currentTrack ? getItemId(currentTrack) : null;
  const source = currentTrack ? getItemSource(currentTrack) : null;
  const uri = useMemo(() => getPlayableUri(currentTrack), [currentTrack]);
  const loadKey = trackId && uri ? `${trackId}|${uri}` : null;

  const audioSource = useMemo(() => (uri ? { uri } : null), [uri]);
  const player = useAudioPlayer(audioSource, { updateInterval: 500 });
  const playerStatus = useAudioPlayerStatus(player);

  // loadKey para el que ya se pidió play() (evita doble arranque).
  const startedKey = useRef<string | null>(null);
  const startPending = useRef(false);
  const lastSeekToken = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const erroredKey = useRef<string | null>(null);
  const finishedKey = useRef<string | null>(null);
  const loadKeyRef = useRef<string | null>(null);
  loadKeyRef.current = loadKey;
  // true cuando ya se oyó sonar este loadKey (distingue buffering de una pausa externa).
  const hasPlayed = useRef(false);
  const playerStatusRef = useRef(playerStatus);
  playerStatusRef.current = playerStatus;
  const lastRetryNonce = useRef(retryNonce);

  // ── Sesión de audio (una vez): reproducir en silencio y en segundo plano ────
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
      allowsRecording: false,
    }).catch((err: unknown) => console.warn("[AudioEngine] setAudioMode falló:", err));
  }, []);

  // ── Reintento manual (audio propio / Audius): recargar la misma URL ─────────
  useEffect(() => {
    if (retryNonce === lastRetryNonce.current) return;
    lastRetryNonce.current = retryNonce;
    erroredKey.current = null;
    startedKey.current = null;
    hasPlayed.current = false;
    if (audioSource) {
      try { player.replace(audioSource); } catch (err) { console.warn("[AudioEngine] replace falló:", err); }
    }
  }, [retryNonce, audioSource, player]);

  // ── Nueva URL → arrancar automáticamente ────────────────────────────────────
  useEffect(() => {
    if (!loadKey) {
      // Sin URL (resolviendo / sin track): no hay nada que reproducir.
      startedKey.current = null;
      startPending.current = false;
      hasPlayed.current = false;
      return;
    }
    if (startedKey.current === loadKey) return;
    startedKey.current = loadKey;
    startPending.current = true;
    hasPlayed.current = false;
    finishedKey.current = null;

    // Pequeño delay para que expo-audio cargue la nueva URI antes de play().
    const timer = setTimeout(() => {
      if (loadKeyRef.current !== loadKey) return; // callback obsoleto
      startPending.current = false;
      if (usePlayerStore.getState().status === "paused") return; // el usuario pausó mientras cargaba
      try {
        player.play();
      } catch (err) {
        console.warn("[AudioEngine] play() falló:", err);
      }
    }, START_DELAY_MS);

    // Si nunca carga ni suena → fallo del stream (se informa arriba, no se resuelve aquí).
    const watchdog = setTimeout(() => {
      if (loadKeyRef.current !== loadKey || erroredKey.current === loadKey) return;
      const st = playerStatusRef.current;
      if (st.playing || st.isLoaded) return;
      if (usePlayerStore.getState().status === "paused") return;
      erroredKey.current = loadKey;
      console.warn("[AudioEngine] timeout de carga del stream");
      if ((source === "youtube" || source === "audius") && trackId) reportPlaybackError(trackId, uri, 0);
      else reportStatus("error");
    }, LOAD_TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
      clearTimeout(watchdog);
      // Si el efecto se re-ejecuta antes de arrancar, permitir un nuevo arranque.
      if (startPending.current && loadKeyRef.current === loadKey) startedKey.current = null;
      startPending.current = false;
    };
  }, [loadKey, player, retryNonce, source, trackId, uri, reportPlaybackError, reportStatus]);

  // ── Play/pause según la intención del store ─────────────────────────────────
  useEffect(() => {
    if (!loadKey || startedKey.current !== loadKey || startPending.current) return;
    if (status === "playing" && !playerStatus.playing) {
      try { player.play(); } catch (err) { console.warn("[AudioEngine] play err:", err); }
    } else if (status === "paused" && playerStatus.playing) {
      try { player.pause(); } catch (err) { console.warn("[AudioEngine] pause err:", err); }
    }
  }, [status, loadKey, player, playerStatus.playing]);

  // ── Seek (se difiere hasta que el recurso esté cargado) ─────────────────────
  useEffect(() => {
    if (!seekRequest || seekRequest.token === lastSeekToken.current) return;
    lastSeekToken.current = seekRequest.token;
    clearSeekRequest();
    if (!loadKey) return;
    if (playerStatus.isLoaded) {
      player.seekTo(seekRequest.seconds).catch(() => {});
    } else {
      pendingSeek.current = seekRequest.seconds;
    }
  }, [seekRequest, loadKey, player, playerStatus.isLoaded, clearSeekRequest]);

  // ── Reanudar en la posición previa tras renovar el stream ───────────────────
  useEffect(() => {
    if (resumeAtSeconds == null) return;
    // Esperar a que la URL cambie (la renovada); la que falló no sirve.
    if (!loadKey || loadKey === erroredKey.current) return;
    pendingSeek.current = resumeAtSeconds;
    clearResumeAt();
  }, [resumeAtSeconds, loadKey, clearResumeAt]);

  useEffect(() => {
    if (!playerStatus.isLoaded || pendingSeek.current == null) return;
    const target = pendingSeek.current;
    pendingSeek.current = null;
    player.seekTo(target).catch(() => {});
  }, [playerStatus.isLoaded, loadKey, player]);

  // ── Error de reproducción → informar al nivel superior (NO resolver aquí) ───
  useEffect(() => {
    if (!loadKey || !trackId || !playerStatus.error) return;
    if (erroredKey.current === loadKey) return;
    erroredKey.current = loadKey;
    console.warn("[AudioEngine] error de reproducción:", playerStatus.error);
    if (source === "youtube" || source === "audius") {
      reportPlaybackError(trackId, uri, playerStatus.currentTime ?? 0);
    } else {
      reportStatus("error");
    }
  }, [playerStatus.error, playerStatus.currentTime, loadKey, trackId, source, uri, reportPlaybackError, reportStatus]);

  // ── Reportar progreso/estado al store ───────────────────────────────────────
  useEffect(() => {
    if (!currentTrack || !loadKey || startedKey.current !== loadKey) return;

    const knownDuration = getItemDuration(currentTrack);
    const duration =
      typeof playerStatus.duration === "number" && playerStatus.duration > 0
        ? playerStatus.duration
        : knownDuration;
    reportProgress(playerStatus.currentTime ?? 0, duration);

    if (erroredKey.current === loadKey) return;
    if (playerStatus.playing) {
      hasPlayed.current = true;
      reportStatus("playing");
    } else if (
      playerStatus.isBuffering ||
      playerStatus.timeControlStatus === "waitingToPlayAtSpecifiedRate"
    ) {
      // Cargando/rebuffering: NO se interpreta como pausa (evita pausar sin querer).
    } else if (
      hasPlayed.current &&
      playerStatus.isLoaded &&
      !playerStatus.didJustFinish &&
      !startPending.current
    ) {
      // Ya sonaba y se detuvo sin buffering: pausa externa (control remoto, llamada, auriculares).
      reportStatus("paused");
    }

    if (playerStatus.didJustFinish && finishedKey.current !== loadKey) {
      finishedKey.current = loadKey;
      onTrackFinished();
    }
  }, [playerStatus, currentTrack, loadKey, reportProgress, reportStatus, onTrackFinished]);

  // ── Controles de pantalla de bloqueo / segundo plano ────────────────────────
  useEffect(() => {
    if (!currentTrack || !loadKey) return;
    try {
      player.setActiveForLockScreen(true, {
        title: getItemTitle(currentTrack),
        artist: getItemArtistName(currentTrack),
        ...(getItemCoverUrl(currentTrack) ? { artworkUrl: getItemCoverUrl(currentTrack) as string } : {}),
      });
    } catch (err) {
      console.warn("[AudioEngine] lock screen:", err);
    }
    return () => {
      try { player.clearLockScreenControls(); } catch { /* player ya liberado */ }
    };
  }, [currentTrack, loadKey, player]);

  return null;
}
