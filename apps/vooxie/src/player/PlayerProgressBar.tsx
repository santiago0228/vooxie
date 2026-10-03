/**
 * PlayerProgressBar — barra de progreso premium.
 *
 * Fix crítico del seek: PanResponder.create se llama una sola vez (useRef),
 * por lo que los closures capturan los valores iniciales. La solución correcta
 * es guardar trackWidth y durationSeconds en refs que el PanResponder lee
 * en tiempo de ejecución, no en tiempo de creación.
 *
 * Fix de coordenadas: locationX puede ser inconsistente en ScrollViews anidados.
 * Usamos pageX (coordenada absoluta de pantalla) y la posición del View medida
 * con measureInWindow para calcular el offset real.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
} from "react-native";

type Props = {
  positionSeconds: number;
  durationSeconds: number;
  onSeek: (seconds: number) => void;
  accentColor?: string;
  trackColor?: string;
  textColor?: string;
};

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function PlayerProgressBar({
  positionSeconds,
  durationSeconds,
  onSeek,
  accentColor = "#FFFFFF",
  trackColor = "rgba(255,255,255,0.15)",
  textColor = "rgba(255,255,255,0.5)",
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const heightAnim = useRef(new Animated.Value(3)).current;
  const trackRef = useRef<View>(null);

  // Refs para valores accedidos en PanResponder (evita closure stale)
  const trackWidthRef = useRef(0);
  const trackPageXRef = useRef(0);
  const durationRef = useRef(durationSeconds);
  const onSeekRef = useRef(onSeek);
  const isDraggingRef = useRef(false);

  // Mantener refs actualizadas en cada render
  useEffect(() => { durationRef.current = durationSeconds; }, [durationSeconds]);
  useEffect(() => { onSeekRef.current = onSeek; }, [onSeek]);

  const measureTrack = useCallback(() => {
    trackRef.current?.measureInWindow((x: number, _y: number, width: number) => {
      if (width > 0) {
        trackWidthRef.current = width;
        trackPageXRef.current = x;
      }
    });
  }, []);

  const getSeekSeconds = useCallback((pageX: number): number => {
    const width = trackWidthRef.current;
    const originX = trackPageXRef.current;
    const duration = durationRef.current;
    if (!width || duration <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (pageX - originX) / width));
    return ratio * duration;
  }, []);

  const animateHeight = useCallback((big: boolean) => {
    Animated.spring(heightAnim, {
      toValue: big ? 5 : 3,
      useNativeDriver: false,
      tension: 200,
      friction: 20,
    }).start();
  }, [heightAnim]);

  // PanResponder creado una sola vez — usa refs para valores actuales
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (e: import('react-native').GestureResponderEvent) => {
        isDraggingRef.current = true;
        setIsDragging(true);
        animateHeight(true);
        // Medir posición de la barra antes de calcular (fresco)
        const seconds = getSeekSeconds(e.nativeEvent.pageX);
        setDragPosition(seconds);
      },

      onPanResponderMove: (e: import('react-native').GestureResponderEvent) => {
        if (!isDraggingRef.current) return;
        const seconds = getSeekSeconds(e.nativeEvent.pageX);
        setDragPosition(seconds);
      },

      onPanResponderRelease: (e: import('react-native').GestureResponderEvent) => {
        isDraggingRef.current = false;
        setIsDragging(false);
        animateHeight(false);
        const seconds = getSeekSeconds(e.nativeEvent.pageX);
        // Guardia: no enviar seek si la duración aún no se conoce
        if (durationRef.current > 0) {
          onSeekRef.current(seconds);
        }
      },

      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        setIsDragging(false);
        animateHeight(false);
      },
    })
  ).current;

  const displayPosition = isDragging ? dragPosition : positionSeconds;
  const progress =
    durationSeconds > 0 ? Math.min(displayPosition / durationSeconds, 1) : 0;
  const remaining = durationSeconds > 0
    ? Math.max(0, durationSeconds - displayPosition)
    : 0;

  return (
    <View style={styles.container}>
      {/* Área táctil — medir con measureInWindow para coordenadas absolutas */}
      <View
        ref={trackRef}
        {...panResponder.panHandlers}
        onLayout={measureTrack}
        style={styles.trackHitArea}
      >
        <Animated.View
          style={[styles.track, { backgroundColor: trackColor, height: heightAnim }]}
        >
          <View
            style={[
              styles.fill,
              { backgroundColor: accentColor, width: `${progress * 100}%` },
            ]}
          />
        </Animated.View>
      </View>

      {/* Tiempos */}
      <View style={styles.timeRow}>
        <Text style={[styles.time, { color: textColor }]}>
          {formatTime(displayPosition)}
        </Text>
        <Text style={[styles.time, { color: textColor }]}>
          {durationSeconds > 0 ? `-${formatTime(remaining)}` : formatTime(durationSeconds)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%" },
  trackHitArea: {
    paddingVertical: 12,
    justifyContent: "center",
  },
  track: {
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  time: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
});
