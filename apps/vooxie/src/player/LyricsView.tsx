/**
 * LyricsView — vista de letras inmersiva (Fase 5, corrección final).
 *
 * Lee positionSeconds directamente del store (no via props) para que la
 * sincronización funcione aunque el componente esté siempre montado.
 *
 * Modo inmersivo: controles se ocultan tras 4s de inactividad.
 * Scroll automático: sigue la línea activa.
 * Sincronización: letra plana (sin timestamps) → sin highlight.
 *                 letra sincronizada (con timestamps) → highlight + scroll.
 */

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  memo,
} from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { type PlayerState, usePlayerStore } from "@vooxie/core";
import { PlayerProgressBar } from "./PlayerProgressBar";

export type LyricLine = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

const isSynced = (lines: LyricLine[]) =>
  lines.some((l) => l.startSeconds > 0);

type Props = {
  lyrics: LyricLine[];
  /** @deprecated — LyricsView lee del store directamente */
  positionSeconds?: number;
  /** @deprecated — LyricsView lee del store directamente */
  durationSeconds?: number;
  isPlaying: boolean;
  title: string;
  artistName: string;
  coverUrl?: string | null;
  onSeek: (s: number) => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
  onCoverPress: () => void;
  onMenuPress?: () => void;
  accentColor?: string;
};

const IMMERSIVE_TIMEOUT = 4000;

export const LyricsView = memo(function LyricsView({
  lyrics,
  isPlaying,
  title,
  artistName,
  coverUrl,
  onSeek,
  onTogglePlay,
  onNext,
  onPrevious,
  onClose,
  onCoverPress,
  onMenuPress,
  accentColor = "#FFFFFF",
}: Props) {
  // Lee progreso del store directamente (no depende de props que puede ser 0)
  const positionSeconds = usePlayerStore(
    (s: PlayerState) => s.positionSeconds
  );
  const durationSeconds = usePlayerStore(
    (s: PlayerState) => s.durationSeconds
  );

  const scrollRef = useRef<ScrollView>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const immersiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineHeights = useRef<number[]>([]);
  const synced = isSynced(lyrics);

  // Índice de la línea actual (solo para letras sincronizadas)
  const currentLineIndex = synced
    ? lyrics.findIndex(
        (l, i) =>
          positionSeconds >= l.startSeconds &&
          (lyrics[i + 1]
            ? positionSeconds < lyrics[i + 1].startSeconds
            : true)
      )
    : -1;

  // Auto-scroll
  useEffect(() => {
    if (!synced || currentLineIndex < 0 || !scrollRef.current) return;
    const offset = lineHeights.current
      .slice(0, currentLineIndex)
      .reduce((sum: number, h: number) => sum + h, 0);
    scrollRef.current.scrollTo({
      y: Math.max(0, offset - 130),
      animated: true,
    });
  }, [currentLineIndex, synced]);

  // Inmersivo
  const fadeControls = useCallback(
    (visible: boolean) => {
      Animated.timing(controlsOpacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 250 : 500,
        useNativeDriver: true,
      }).start(() => {
        if (!visible) setControlsVisible(false);
      });
    },
    [controlsOpacity]
  );

  const resetImmersiveTimer = useCallback(() => {
    if (immersiveTimer.current) clearTimeout(immersiveTimer.current);
    if (!controlsVisible) {
      setControlsVisible(true);
      fadeControls(true);
    }
    immersiveTimer.current = setTimeout(() => {
      fadeControls(false);
    }, IMMERSIVE_TIMEOUT);
  }, [controlsVisible, fadeControls]);

  useEffect(() => {
    resetImmersiveTimer();
    return () => {
      if (immersiveTimer.current) clearTimeout(immersiveTimer.current);
    };
  }, []);

  return (
    <Pressable style={styles.container} onPress={resetImmersiveTimer}>
      {/* Top bar */}
      <Animated.View style={[styles.topBar, { opacity: controlsOpacity }]}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Ionicons
            name="chevron-down"
            size={26}
            color="rgba(255,255,255,0.85)"
          />
        </Pressable>
        {onMenuPress ? (
          <Pressable onPress={onMenuPress} hitSlop={12}>
            <Ionicons
              name="ellipsis-horizontal"
              size={22}
              color="rgba(255,255,255,0.5)"
            />
          </Pressable>
        ) : null}
      </Animated.View>

      {/* Cabecera canción */}
      <Animated.View
        style={[styles.songHeader, { opacity: controlsOpacity }]}
      >
        <TouchableOpacity onPress={onCoverPress} activeOpacity={0.8}>
          <View style={styles.miniCover}>
            {coverUrl ? (
              <Image source={{ uri: coverUrl }} style={styles.miniCoverImg} />
            ) : (
              <Ionicons
                name="musical-note"
                size={18}
                color="rgba(255,255,255,0.5)"
              />
            )}
          </View>
        </TouchableOpacity>
        <View style={styles.songInfo}>
          <Text style={styles.songTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.songArtist} numberOfLines={1}>
            {artistName}
          </Text>
        </View>
      </Animated.View>

      {/* Letras */}
      <ScrollView
        ref={scrollRef}
        style={styles.lyricsScroll}
        contentContainerStyle={styles.lyricsContent}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={resetImmersiveTimer}
      >
        {lyrics.length > 0 ? (
          lyrics.map((line, i) => {
            const isCurrent = synced && i === currentLineIndex;
            const isPast = synced && i < currentLineIndex;
            const opacity = synced
              ? isCurrent
                ? 1
                : isPast
                ? 0.3
                : 0.45
              : 0.85; // Sin sincronizar: todas igual

            return (
              <Pressable
                key={i}
                onPress={() => {
                  if (synced) onSeek(line.startSeconds);
                  resetImmersiveTimer();
                }}
                onLayout={(e: import("react-native").LayoutChangeEvent) => {
                  lineHeights.current[i] = e.nativeEvent.layout.height;
                }}
              >
                <Text
                  style={[
                    styles.lyricLine,
                    {
                      opacity,
                      fontSize: isCurrent ? 28 : 24,
                      fontWeight: isCurrent ? "700" : "600",
                      color: "#FFFFFF",
                    },
                  ]}
                >
                  {line.text}
                </Text>
              </Pressable>
            );
          })
        ) : (
          <Text style={styles.noLyrics}>Letra no disponible</Text>
        )}
        <View style={{ height: 200 }} />
      </ScrollView>

      {/* Controles */}
      <Animated.View style={[styles.controls, { opacity: controlsOpacity }]}>
        <PlayerProgressBar
          positionSeconds={positionSeconds}
          durationSeconds={durationSeconds}
          onSeek={onSeek}
          accentColor="rgba(255,255,255,0.9)"
          trackColor="rgba(255,255,255,0.12)"
          textColor="rgba(255,255,255,0.4)"
        />
        <View style={styles.controlRow}>
          <Pressable onPress={onPrevious} hitSlop={14}>
            <Ionicons
              name="play-skip-back"
              size={26}
              color="rgba(255,255,255,0.8)"
            />
          </Pressable>
          <Pressable onPress={onTogglePlay} style={styles.playBtn}>
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={28}
              color="#070A10"
              style={isPlaying ? undefined : { marginLeft: 2 }}
            />
          </Pressable>
          <Pressable onPress={onNext} hitSlop={14}>
            <Ionicons
              name="play-skip-forward"
              size={26}
              color="rgba(255,255,255,0.8)"
            />
          </Pressable>
        </View>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 28, backgroundColor: 'transparent' },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  songHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 28,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  miniCover: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  miniCoverImg: { width: "100%", height: "100%" },
  songInfo: { flex: 1 },
  songTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  songArtist: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    marginTop: 1,
  },
  lyricsScroll: { flex: 1 },
  lyricsContent: { paddingBottom: 40 },
  lyricLine: {
    lineHeight: 40,
    marginVertical: 4,
    letterSpacing: -0.3,
  },
  noLyrics: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 18,
    textAlign: "center",
    marginTop: 60,
    fontStyle: "italic",
  },
  controls: { paddingVertical: 16, gap: 14 },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 36,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
});
