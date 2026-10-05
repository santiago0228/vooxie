/**
 * CanvasView — Fase 5 (final)
 *
 * Modos:
 *   "canvas" — video mudo en bucle a pantalla completa (expo-video)
 *   "video"  — (heredado) fondo negro + controles. El audio de YouTube ahora se
 *              reproduce con expo-audio desde el stream resuelto, sin video
 *              embebido; el player screen ya no entra a este modo.
 */

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Image,
} from "react-native";
import { CanvasLoop } from "./CanvasLoop";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { CoverBackdrop } from "@vooxie/ui";
import { type PlayerState, usePlayerStore } from "@vooxie/core";
import { PlayerProgressBar } from "./PlayerProgressBar";

export type CanvasMode = "canvas" | "video";

type Props = {
  mode: CanvasMode;
  canvasUrl?: string | null;
  isPlaying: boolean;
  title: string;
  artistName: string;
  coverUrl?: string | null;
  isFavorite?: boolean;
  onSeek: (s: number) => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
  onMenuPress?: () => void;
  onToggleFavorite?: () => void;
  /**
   * Solo relevante en mode="video".
   * El player screen pasa aquí su handleVideoAreaReady.
   * CanvasView llama a esta función con el ref de su contenedor raíz
   * tan pronto como el layout nativo está disponible.
   * El player screen hace measureInWindow() sobre ese ref para obtener
   * las coordenadas absolutas reales del área donde debe aparecer el video.
   */
  onVideoAreaReady: ((ref: View | null) => void) | null;
};

const IMMERSIVE_TIMEOUT = 4000;

export function CanvasView({
  mode,
  canvasUrl,
  isPlaying,
  title,
  artistName,
  coverUrl,
  isFavorite,
  onSeek,
  onTogglePlay,
  onNext,
  onPrevious,
  onClose,
  onMenuPress,
  onToggleFavorite,
  onVideoAreaReady,
}: Props) {
  // Ref del contenedor raíz — para measureInWindow en modo video
  const rootRef = useRef<View>(null);

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const [controlsVisible, setControlsVisible] = useState(true);
  const immersiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canvasError, setCanvasError] = useState(false);

  // ── Inmersivo ─────────────────────────────────────────────────────────────

  const fadeControls = useCallback(
    (visible: boolean, cb?: () => void) => {
      Animated.timing(controlsOpacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 250 : 600,
        useNativeDriver: true,
      }).start(cb);
    },
    [controlsOpacity]
  );

  const scheduleHide = useCallback(() => {
    if (immersiveTimer.current) clearTimeout(immersiveTimer.current);
    immersiveTimer.current = setTimeout(() => {
      fadeControls(false, () => setControlsVisible(false));
    }, IMMERSIVE_TIMEOUT);
  }, [fadeControls]);

  const handleTouch = useCallback(() => {
    if (!controlsVisible) {
      setControlsVisible(true);
      fadeControls(true);
    }
    scheduleHide();
  }, [controlsVisible, fadeControls, scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (immersiveTimer.current) clearTimeout(immersiveTimer.current);
    };
  }, [scheduleHide]);

  // Resetear error de Canvas si cambia la URL
  useEffect(() => {
    setCanvasError(false);
  }, [canvasUrl]);

  // ── onVideoAreaReady: notificar cuando el contenedor está montado ──────────
  // Se llama en el onLayout del View raíz (modo video).
  // onLayout garantiza que el View ya tiene dimensiones en el árbol nativo
  // y el ref está resuelto — momento seguro para measureInWindow().
  const handleRootLayout = useCallback(() => {
    if (mode === "video" && onVideoAreaReady) {
      // Doble rAF: asegura que el commit nativo completó en iOS y Android.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onVideoAreaReady(rootRef.current);
        });
      });
    }
  }, [mode, onVideoAreaReady]);

  // ── Render ────────────────────────────────────────────────────────────────

  // Leer progreso del store directamente (mismo patrón que LyricsView)
  const positionSeconds = usePlayerStore((s: PlayerState) => s.positionSeconds);
  const durationSeconds = usePlayerStore((s: PlayerState) => s.durationSeconds);

  return (
    <View
      ref={rootRef}
      style={styles.container}
      onLayout={handleRootLayout}
    >
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={handleTouch}
    >
      {/* Fondo según modo */}
      {mode === "canvas" && canvasUrl && !canvasError ? (
        <CanvasLoop
          key={`canvas-${canvasUrl}`}
          url={canvasUrl}
          poster={coverUrl}
          playing={isPlaying}
          onError={() => setCanvasError(true)}
        />
      ) : mode === "canvas" ? (
        // Fallback: fondo con los colores de la portada si Canvas falla o no hay URL
        <CoverBackdrop uri={coverUrl} />
      ) : (
        // Modo video (heredado): fondo negro de soporte.
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />
      )}

      {/* Degradado para legibilidad: oscurece arriba y abajo, deja ver el video al centro */}
      <LinearGradient
        colors={["rgba(6,8,13,0.55)", "rgba(6,8,13,0.05)", "rgba(6,8,13,0.15)", "rgba(6,8,13,0.88)"]}
        locations={[0, 0.25, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Top bar */}
      <Animated.View style={[styles.topBar, { opacity: controlsOpacity }]}>
        <Pressable onPress={onClose} hitSlop={14}>
          <Ionicons name="chevron-down" size={26} color="rgba(255,255,255,0.9)" />
        </Pressable>
        <Text style={styles.topLabel}>REPRODUCIENDO</Text>
        <Pressable onPress={onMenuPress} hitSlop={14}>
          <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.6)" />
        </Pressable>
      </Animated.View>

      {/* Espaciador */}
      <View style={{ flex: 1 }} pointerEvents="none" />

      {/* Zona inferior */}
      <Animated.View style={[styles.bottom, { opacity: controlsOpacity }]}>
        {/* Info canción */}
        <View style={styles.trackInfo}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.miniThumb} />
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.trackTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.trackArtist} numberOfLines={1}>{artistName}</Text>
          </View>
          <Pressable onPress={onToggleFavorite} hitSlop={14}>
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={24}
              color={isFavorite ? "#FFFFFF" : "rgba(255,255,255,0.6)"}
            />
          </Pressable>
        </View>

        {/* Progreso */}
        <PlayerProgressBar
          positionSeconds={positionSeconds}
          durationSeconds={durationSeconds}
          onSeek={onSeek}
          accentColor="rgba(255,255,255,0.95)"
          trackColor="rgba(255,255,255,0.2)"
          textColor="rgba(255,255,255,0.45)"
        />

        {/* Controles */}
        <View style={styles.controlRow}>
          <Pressable onPress={onPrevious} hitSlop={14}>
            <Ionicons name="play-skip-back" size={28} color="rgba(255,255,255,0.85)" />
          </Pressable>
          <Pressable onPress={onTogglePlay} style={styles.playBtn}>
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={30}
              color="#000000"
              style={isPlaying ? undefined : { marginLeft: 3 }}
            />
          </Pressable>
          <Pressable onPress={onNext} hitSlop={14}>
            <Ionicons name="play-skip-forward" size={28} color="rgba(255,255,255,0.85)" />
          </Pressable>
        </View>
      </Animated.View>
    </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    zIndex: 2,
  },
  topLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 2.2,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
  },
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    gap: 14,
    zIndex: 2,
  },
  trackInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  miniThumb: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.1,
  },
  trackArtist: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 40,
    marginTop: 4,
  },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
