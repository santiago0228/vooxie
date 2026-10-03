import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Borrador de lanzamiento (Fase 3, "Crear lanzamiento").
 *
 * DECISIÓN: `tracks.audio_url` es NOT NULL en el esquema actual (migración
 * 0003), así que no se puede crear una fila de `tracks` en Supabase antes
 * de tener el audio ya subido — insertar un borrador ahí implicaría un
 * placeholder falso. Este store guarda el progreso del wizard EN EL
 * DISPOSITIVO (AsyncStorage, mismo mecanismo que ya usa la sesión de
 * Supabase) mientras el artista completa los pasos. Solo se escribe en
 * Supabase una vez, al publicar (ver releaseService.publishRelease), con
 * el álbum y las canciones ya con audio real.
 *
 * Esto cubre "salir y volver" en el mismo dispositivo. Borradores que
 * sincronicen entre dispositivos necesitarían volver `audio_url` nullable
 * — no se hizo ese cambio de esquema en esta fase, queda documentado.
 */

const STORAGE_KEY = "vooxie-artistas:release-draft:v1";

export type ReleaseType = "single" | "ep" | "album";

export type DraftTrack = {
  /** Id local, solo para keys de lista y edición — no existe en Supabase todavía. */
  localId: string;
  title: string;
  trackNumber: number;
  isExplicit: boolean;
  description: string;
  genreId: string | null;
  /** Nombres de colaboradores en texto libre (sección 14 — sin cuentas todavía). */
  feats: string[];
  /** Archivo elegido en el dispositivo, todavía no subido a Supabase Storage. */
  localAudioUri: string | null;
  localAudioFileName: string | null;
  localAudioDurationSeconds: number | null;
};

export type ReleaseDraft = {
  releaseType: ReleaseType;
  title: string;
  description: string;
  releaseDate: string | null; // ISO date (yyyy-mm-dd)
  localCoverUri: string | null;
  tracks: DraftTrack[];
};

function emptyDraft(): ReleaseDraft {
  return {
    releaseType: "single",
    title: "",
    description: "",
    releaseDate: null,
    localCoverUri: null,
    tracks: [],
  };
}

function makeEmptyTrack(trackNumber: number): DraftTrack {
  return {
    localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    trackNumber,
    isExplicit: false,
    description: "",
    genreId: null,
    feats: [],
    localAudioUri: null,
    localAudioFileName: null,
    localAudioDurationSeconds: null,
  };
}

type ReleaseDraftState = {
  draft: ReleaseDraft;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setReleaseType: (type: ReleaseType) => void;
  setInfo: (patch: Partial<Pick<ReleaseDraft, "title" | "description" | "releaseDate">>) => void;
  setCover: (localUri: string | null) => void;
  addTrack: () => string; // devuelve el localId del nuevo track
  updateTrack: (localId: string, patch: Partial<DraftTrack>) => void;
  removeTrack: (localId: string) => void;
  reset: () => Promise<void>;
};

// Debounce: el estado de Zustand se actualiza inmediatamente en cada
// keystroke (para que la UI sea reactiva), pero la escritura en
// AsyncStorage se difiere 400 ms desde el último cambio. Esto elimina
// el flood de setItem() que en Android causaba re-renders adicionales
// y pérdida intermitente de foco en los TextInputs.
// Se conserva la persistencia completa — el último valor siempre se
// escribe porque el timer se reinicia con cada cambio.
let _persistTimer: ReturnType<typeof setTimeout> | null = null;

function persist(draft: ReleaseDraft): void {
  if (_persistTimer !== null) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(async () => {
    _persistTimer = null;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Persistencia del borrador es "nice to have" — si falla, el wizard
      // sigue funcionando en memoria durante la sesión actual.
    }
  }, 400);
}

export const useReleaseDraftStore = create<ReleaseDraftState>((set, get) => ({
  draft: emptyDraft(),
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) set({ draft: JSON.parse(raw) as ReleaseDraft });
    } catch {
      // Si el borrador guardado está corrupto, se ignora y se arranca vacío.
    } finally {
      set({ hydrated: true });
    }
  },

  setReleaseType: (releaseType) => {
    const draft = { ...get().draft, releaseType };
    // Single: siempre exactamente 1 canción — si venía de EP/Álbum con
    // varias, se recorta a la primera para no dejar canciones "de más"
    // que la UI de Single no muestra.
    if (releaseType === "single" && draft.tracks.length > 1) {
      draft.tracks = draft.tracks.slice(0, 1);
    }
    set({ draft });
    persist(draft);
  },

  setInfo: (patch) => {
    const draft = { ...get().draft, ...patch };
    set({ draft });
    persist(draft);
  },

  setCover: (localCoverUri) => {
    const draft = { ...get().draft, localCoverUri };
    set({ draft });
    persist(draft);
  },

  addTrack: () => {
    const current = get().draft;
    if (current.releaseType === "single" && current.tracks.length >= 1) {
      return current.tracks[0].localId;
    }
    const newTrack = makeEmptyTrack(current.tracks.length + 1);
    const draft = { ...current, tracks: [...current.tracks, newTrack] };
    set({ draft });
    persist(draft);
    return newTrack.localId;
  },

  updateTrack: (localId, patch) => {
    const current = get().draft;
    const draft = {
      ...current,
      tracks: current.tracks.map((t) => (t.localId === localId ? { ...t, ...patch } : t)),
    };
    set({ draft });
    persist(draft);
  },

  removeTrack: (localId) => {
    const current = get().draft;
    const remaining = current.tracks
      .filter((t) => t.localId !== localId)
      .map((t, i) => ({ ...t, trackNumber: i + 1 }));
    const draft = { ...current, tracks: remaining };
    set({ draft });
    persist(draft);
  },

  reset: async () => {
    // Cancelar cualquier persist() pendiente para que no sobreescriba
    // AsyncStorage después de que lo limpiemos aquí.
    if (_persistTimer !== null) {
      clearTimeout(_persistTimer);
      _persistTimer = null;
    }
    set({ draft: emptyDraft() });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // no-op — si falla el removeItem, el próximo `persist()` igual
      // sobrescribe la clave con el draft vacío.
    }
  },
}));
