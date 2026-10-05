import { create } from "zustand";
import type { Track } from "../catalog/types";
import { toPlayable } from "../catalog/playable";
import {
  type PlayableItem,
  isVooxieTrack,
  isExternalTrack,
  getItemId,
  getItemDuration,
  getItemSource,
} from "./PlayableItem";
import { incrementTrackPlays } from "../catalog/catalogService";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

type SeekRequest = { seconds: number; token: number };

export type PlayerState = {
  queue: PlayableItem[];
  currentIndex: number;           // -1 = nada cargado
  currentTrack: PlayableItem | null;
  status: PlayerStatus;
  positionSeconds: number;
  durationSeconds: number;
  seekRequest: SeekRequest | null;

  /**
   * Reemplaza la cola y empieza a reproducir desde `track`.
   * Acepta Track de Supabase o ExternalTrack (Audius/YouTube).
   * La cola puede mezclar tipos — el AudioEngine reproduce siempre una URL de
   * audio; para YouTube el TrackResolver la obtiene (resolveTrack) antes.
   */
  playTrack: (track: PlayableItem, queue?: PlayableItem[]) => void;
  /** Añade un track al final de la cola (detrás de la canción actual). */
  addToQueue: (track: PlayableItem) => void;
  /**
   * Elimina un track de la cola por su índice absoluto.
   * No permite eliminar el currentIndex. Actualiza currentIndex si es necesario.
   */
  removeFromQueue: (absoluteIndex: number) => void;

  /** Versión legacy para compatibilidad — acepta Track[] de Supabase. */
  playVooxieTrack: (track: Track, queue?: Track[]) => void;

  togglePlayPause: () => void;
  playNext: () => void;
  playPrevious: () => void;
  seekTo: (seconds: number) => void;

  /**
   * Reemplaza el track actual (y su entrada en la cola) por una versión
   * actualizada con el MISMO id — p. ej. con un `streamUrl` renovado.
   * No reinicia posición ni estado. Lo usa SOLO el nivel superior
   * (TrackResolver); el player nunca resuelve audio por su cuenta.
   */
  updateTrack: (track: PlayableItem) => void;

  /**
   * El player no pudo reproducir el stream actual (expiró/403/red). Lo emite
   * el AudioEngine; lo atiende el TrackResolver (nivel superior).
   */
  playbackError: { trackId: string; streamUrl: string | null; at: number; manual?: boolean } | null;
  /** Segundo al que reanudar tras recargar el stream renovado del mismo track. */
  resumeAtSeconds: number | null;
  /** Se incrementa al reintentar manualmente un track que falló (fuerza recarga en el engine). */
  retryNonce: number;

  // Shuffle y Repeat — afectan playNext y _onTrackFinished
  shuffle: boolean;
  setShuffle: (on: boolean) => void;
  repeatMode: "none" | "all" | "one";
  setRepeatMode: (m: "none" | "all" | "one") => void;

  // Historial de índices visitados en modo shuffle (para Previous coherente)
  _shuffleHistory: number[];
  // Ciclo de shuffle: índices pendientes de reproducir en el ciclo actual.
  // Cuando se vacía, se inicia un nuevo ciclo (para repeat ALL) o se detiene.
  _shuffleCycle: number[];

  // Usados SOLO por AudioEngine/TrackResolver para reportar estado real —
  // ninguna pantalla debe llamar a estos directamente.
  _reportStatus: (status: PlayerStatus) => void;
  _reportPlaybackError: (trackId: string, streamUrl: string | null, resumeAt: number) => void;
  _clearPlaybackError: () => void;
  _clearResumeAt: () => void;
  _reportProgress: (positionSeconds: number, durationSeconds: number) => void;
  _clearSeekRequest: () => void;
  _onTrackFinished: () => void;
};

let seekTokenCounter = 0;

export const usePlayerStore = create<PlayerState>()(
  (set: (partial: Partial<PlayerState> | ((state: PlayerState) => Partial<PlayerState>)) => void,
   get: () => PlayerState) => ({
  queue: [],
  currentIndex: -1,
  currentTrack: null,
  status: "idle",
  positionSeconds: 0,
  durationSeconds: 0,
  seekRequest: null,
  shuffle: false,
  setShuffle: (on: boolean) => {
    if (on) {
      // Inicializar ciclo excluyendo la canción actual
      const { queue, currentIndex } = get();
      const cycle = queue
        .map((_: PlayableItem, i: number) => i)
        .filter((i: number) => i !== currentIndex);
      // Barajar Fisher-Yates
      for (let k = cycle.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [cycle[k], cycle[j]] = [cycle[j], cycle[k]];
      }
      set({ shuffle: true, _shuffleCycle: cycle, _shuffleHistory: [] });
    } else {
      set({ shuffle: false, _shuffleCycle: [], _shuffleHistory: [] });
    }
  },
  repeatMode: "none",
  setRepeatMode: (m: "none" | "all" | "one") => set({ repeatMode: m }),
  _shuffleHistory: [],
  _shuffleCycle: [],
  playbackError: null,
  resumeAtSeconds: null,
  retryNonce: 0,

  playTrack: (rawTrack: PlayableItem, rawQueue?: PlayableItem[]) => {
    // Los tracks importados (solo youtube_id) se convierten a tracks de YouTube;
    // el TrackResolver les consigue el stream. Los demás pasan sin cambios.
    const track = toPlayable(rawTrack);
    const queue = rawQueue?.map(toPlayable);
    const effectiveQueue =
      queue && queue.length
        ? queue
        : get().queue.length
          ? get().queue
          : [track];

    const id = getItemId(track);
    const index = effectiveQueue.findIndex((t: PlayableItem) => getItemId(t) === id);

    set({
      queue: effectiveQueue,
      currentIndex: index === -1 ? 0 : index,
      currentTrack: track,
      status: "loading",
      positionSeconds: 0,
      durationSeconds: getItemDuration(track),
      playbackError: null,
      resumeAtSeconds: null,
    });

    // Solo contamos reproducciones para tracks propios de VOOXIE
    if (isVooxieTrack(track)) {
      incrementTrackPlays(track.id);
    }
  },

  // Mantener compatibilidad con código existente que usa Track de Supabase
  playVooxieTrack: (track: Track, queue?: Track[]) => {
    get().playTrack(track, queue);
  },

  addToQueue: (track: PlayableItem) => {
    const { queue } = get();
    set({ queue: [...queue, toPlayable(track)] });
    // Si shuffle está activo, añadir el nuevo track al ciclo pendiente
    const { shuffle, _shuffleCycle } = get();
    if (shuffle) {
      const newIdx = get().queue.length - 1;
      set({ _shuffleCycle: [..._shuffleCycle, newIdx] });
    }
  },

  removeFromQueue: (absoluteIndex: number) => {
    const { queue, currentIndex, _shuffleCycle, _shuffleHistory } = get();
    // No eliminar la canción actual
    if (absoluteIndex === currentIndex) return;
    // No eliminar fuera de rango
    if (absoluteIndex < 0 || absoluteIndex >= queue.length) return;

    const newQueue = queue.filter((_: PlayableItem, i: number) => i !== absoluteIndex);
    // Ajustar currentIndex si el eliminado era anterior al actual
    const newCurrentIndex =
      absoluteIndex < currentIndex ? currentIndex - 1 : currentIndex;

    // Ajustar _shuffleCycle: reasignar índices afectados
    const newCycle = _shuffleCycle
      .filter((i: number) => i !== absoluteIndex)
      .map((i: number) => (i > absoluteIndex ? i - 1 : i));

    const newHistory = _shuffleHistory
      .filter((i: number) => i !== absoluteIndex)
      .map((i: number) => (i > absoluteIndex ? i - 1 : i));

    set({
      queue: newQueue,
      currentIndex: newCurrentIndex,
      _shuffleCycle: newCycle,
      _shuffleHistory: newHistory,
    });
  },

  togglePlayPause: () => {
    const { status, currentTrack } = get();
    if (!currentTrack) return;
    if (status === "error") {
      if (isExternalTrack(currentTrack) && currentTrack.source === "youtube") {
        // Reintento manual: el TrackResolver renueva el stream (el nivel superior, no el player).
        set({
          status: "loading",
          playbackError: {
            trackId: getItemId(currentTrack),
            streamUrl: currentTrack.streamUrl ?? null,
            at: Date.now(),
            manual: true,
          },
        });
      } else {
        // Audio propio / Audius: simplemente recargar la misma URL.
        set({ status: "loading", retryNonce: get().retryNonce + 1 });
      }
      return;
    }
    if (status === "playing") set({ status: "paused" });
    else if (status === "paused" || status === "idle") set({ status: "playing" });
  },

  playNext: () => {
    const { queue, currentIndex, shuffle, repeatMode, _shuffleHistory, _shuffleCycle } = get();
    if (queue.length === 0) return;

    let nextIndex: number;

    if (shuffle) {
      // CICLO DE SHUFFLE: sacamos de la lista de pendientes para no repetir
      // antes de haber reproducido todas las canciones del ciclo.
      let cycle = _shuffleCycle.filter((i: number) => i !== currentIndex);

      if (cycle.length === 0) {
        // Ciclo agotado — todos reproducidos
        if (repeatMode === "all") {
          // Nuevo ciclo excluyendo solo la actual (para no empezar igual)
          cycle = queue
            .map((_: PlayableItem, i: number) => i)
            .filter((i: number) => i !== currentIndex);
          // Barajar el ciclo nuevo
          for (let k = cycle.length - 1; k > 0; k--) {
            const j = Math.floor(Math.random() * (k + 1));
            [cycle[k], cycle[j]] = [cycle[j], cycle[k]];
          }
        } else {
          // Sin repeat — fin de cola en shuffle
          set({ status: "paused", positionSeconds: 0 });
          return;
        }
      }

      // Tomar el primero del ciclo barajado (o elegir aleatoriamente del resto)
      const pickPos = Math.floor(Math.random() * cycle.length);
      nextIndex = cycle[pickPos];
      cycle.splice(pickPos, 1);

      set({
        _shuffleHistory: [..._shuffleHistory, currentIndex],
        _shuffleCycle: cycle,
      });
    } else {
      if (currentIndex >= queue.length - 1) {
        if (repeatMode === "all") nextIndex = 0;
        else return;
      } else {
        nextIndex = currentIndex + 1;
      }
    }

    const track = queue[nextIndex];
    set({
      currentIndex: nextIndex,
      currentTrack: track,
      status: "loading",
      positionSeconds: 0,
      durationSeconds: getItemDuration(track),
      playbackError: null,
      resumeAtSeconds: null,
    });
    if (isVooxieTrack(track)) incrementTrackPlays(track.id);
  },

  playPrevious: () => {
    const { queue, currentIndex, shuffle, _shuffleHistory, positionSeconds } = get();

    // Si llevamos más de 3s reproducidos, volver al inicio de la canción actual
    if (positionSeconds > 3) {
      get().seekTo(0);
      return;
    }

    let prevIndex: number;

    if (shuffle && _shuffleHistory.length > 0) {
      // En shuffle: volver al historial
      const history = [..._shuffleHistory];
      prevIndex = history.pop()!;
      set({ _shuffleHistory: history });
    } else {
      if (currentIndex <= 0) return;
      prevIndex = currentIndex - 1;
    }

    const track = queue[prevIndex];
    if (!track) return;
    set({
      currentIndex: prevIndex,
      currentTrack: track,
      status: "loading",
      positionSeconds: 0,
      durationSeconds: getItemDuration(track),
      playbackError: null,
      resumeAtSeconds: null,
    });
    if (isVooxieTrack(track)) incrementTrackPlays(track.id);
  },

  seekTo: (seconds: number) => {
    const { currentTrack } = get();
    if (!currentTrack) return;
    // El AudioEngine atiende seekRequest para todas las fuentes.
    seekTokenCounter += 1;
    set({ seekRequest: { seconds, token: seekTokenCounter } });
  },

  updateTrack: (track: PlayableItem) => {
    const id = getItemId(track);
    const { currentTrack, queue } = get();
    const nextQueue = queue.map((t: PlayableItem) => (getItemId(t) === id ? track : t));
    if (currentTrack && getItemId(currentTrack) === id) {
      set({ queue: nextQueue, currentTrack: track });
    } else {
      set({ queue: nextQueue });
    }
  },

  _reportStatus: (status: PlayerStatus) => set({ status }),
  _reportPlaybackError: (trackId: string, streamUrl: string | null, resumeAt: number) =>
    set({
      playbackError: { trackId, streamUrl, at: Date.now() },
      resumeAtSeconds: resumeAt > 1 ? resumeAt : null,
      status: "loading",
    }),
  _clearPlaybackError: () => set({ playbackError: null }),
  _clearResumeAt: () => set({ resumeAtSeconds: null }),
  _reportProgress: (positionSeconds: number, durationSeconds: number) =>
    set({ positionSeconds, durationSeconds }),
  _clearSeekRequest: () => set({ seekRequest: null }),

  _onTrackFinished: () => {
    const { repeatMode, currentTrack } = get();
    console.log("[Player] track finished, repeatMode:", repeatMode);

    // Repeat ONE: reiniciar la misma canción (seek a 0 y seguir en playing)
    if (repeatMode === "one" && currentTrack) {
      seekTokenCounter += 1;
      set({
        seekRequest: { seconds: 0, token: seekTokenCounter },
        status: "playing",
        positionSeconds: 0,
      });
      return;
    }

    // Sin repeat ONE — intentar siguiente
    const { queue, currentIndex, shuffle } = get();
    const isLast = currentIndex >= queue.length - 1;
    console.log("[Player] next: isLast=", isLast, "shuffle=", shuffle, "repeatMode=", repeatMode);

    if (shuffle) {
      get().playNext();
    } else if (!isLast || repeatMode === "all") {
      get().playNext();
    } else {
      // Fin de cola sin repeat
      set({ status: "paused", positionSeconds: 0 });
    }
  },
}));
