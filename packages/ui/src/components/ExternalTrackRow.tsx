/**
 * ExternalTrackRow
 *
 * Muestra un track de una fuente externa (Audius, YouTube) en las listas
 * de búsqueda. Tiene el mismo layout que TrackRow de VOOXIE para
 * consistencia visual, pero agrega un badge de fuente (AUDIUS / YT).
 *
 * DISEÑO DELIBERADO:
 * - No extiende TrackRow — los tipos son distintos (ExternalTrack vs Track)
 *   y las acciones también (no hay favorito, no hay reproductor nativo aún).
 * - El badge es pequeño y discreto — estética iOS/premium sin ser ruidoso.
 * - onPress recibe el ExternalTrack completo: el caller decide qué hacer
 *   (en Parte 3, conectará al reproductor externo).
 * - YouTube muestra un ícono de play sobre el thumbnail — señal visual de
 *   que la reproducción será diferente (WebView embed).
 *
 * NOTA sobre imports:
 * packages/ui NO puede importar de @vooxie/core (dependencia circular:
 * core → ui es válido, ui → core no). Los tipos mínimos necesarios se
 * definen localmente. La aplicación que usa este componente pasará objetos
 * que conforman estos tipos.
 */

import React from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../tokens/ThemeProvider";
import { spacing, radius, typography } from "../tokens/spacing";

// ─── Tipos locales (espejo de external/types.ts sin importar core) ─────────────

type ContentSource = "vooxie" | "audius" | "youtube";

type ExternalArtwork = {
  thumbnail: string;
  large: string | null;
};

type ExternalTrackArtist = {
  externalId: string;
  name: string;
  handle: string | null;
};

/** Shape mínimo que este componente necesita — compatible con ExternalTrack de core. */
export type ExternalTrackShape = {
  source: ContentSource;
  externalId: string;
  title: string;
  artist: ExternalTrackArtist;
  artwork: ExternalArtwork | null;
  durationSeconds: number | null;
  isExplicit: boolean;
  streamRef: string;
};

type ExternalTrackRowProps = {
  track: ExternalTrackShape;
  isActive?: boolean;
  onPress?: (track: ExternalTrackShape) => void;
};

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function sourceBadgeLabel(source: ContentSource): string {
  if (source === "audius") return "AUDIUS";
  if (source === "youtube") return "YT";
  return "";
}

export function ExternalTrackRow({
  track,
  isActive,
  onPress,
}: ExternalTrackRowProps) {
  const { theme } = useTheme();

  const thumbnailUri = track.artwork?.thumbnail ?? null;
  const badgeLabel = sourceBadgeLabel(track.source);

  return (
    <Pressable
      onPress={() => onPress?.(track)}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      {/* Cover / Thumbnail */}
      <View style={[styles.cover, { backgroundColor: theme.surfaceElevated }]}>
        {thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={styles.coverImage} />
        ) : (
          <Ionicons
            name="musical-note"
            size={18}
            color={theme.textSecondary}
          />
        )}
        {/* YouTube: ícono de play sobre la imagen (señal visual de WebView) */}
        {track.source === "youtube" && thumbnailUri && (
          <View style={styles.ytOverlay}>
            <Ionicons name="play" size={10} color="#FFFFFF" />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text
            numberOfLines={1}
            style={[
              styles.title,
              { color: isActive ? theme.accent : theme.text },
              styles.titleFlex,
            ]}
          >
            {track.title}
            {track.isExplicit ? "  🅴" : ""}
          </Text>
          {/* Badge de fuente */}
          {badgeLabel ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
                {badgeLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          style={[styles.artist, { color: theme.textSecondary }]}
        >
          {track.artist.name}
          {track.artist.handle ? ` · @${track.artist.handle}` : ""}
        </Text>
      </View>

      {/* Duración */}
      <Text style={[styles.duration, { color: theme.textSecondary }]}>
        {formatDuration(track.durationSeconds)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coverImage: { width: "100%", height: "100%" },
  ytOverlay: {
    position: "absolute",
    bottom: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1, gap: 2 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  titleFlex: { flex: 1 },
  title: { ...typography.bodyStrong },
  artist: { ...typography.caption },
  duration: { ...typography.caption },
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
