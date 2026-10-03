/**
 * TrackMenuSheet — menú de tres puntos del reproductor.
 *
 * Todas las acciones están conectadas a sistemas reales.
 * "Ver álbum" solo aparece si el track VOOXIE tiene album_id.
 * "Añadir a cola" usa addToQueue del store (única fuente de verdad).
 */

import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  usePlayerStore,
  isVooxieTrack,
  getItemTitle,
  getItemArtistName,
  getItemCoverUrl,
  type PlayableItem,
  type PlayerState,
} from "@vooxie/core";

type Props = {
  visible: boolean;
  onClose: () => void;
  track: PlayableItem;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onShare: () => void;
  onViewArtist?: () => void;
  onViewAlbum?: () => void;
  onOpenLyrics: () => void;
  onOpenQueue: () => void;
  onOpenInfo: () => void;
};

type MenuAction = {
  icon: string;
  label: string;
  onPress: () => void;
  highlighted?: boolean;
  hidden?: boolean;
};

export function TrackMenuSheet({
  visible,
  onClose,
  track,
  isFavorite,
  onToggleFavorite,
  onShare,
  onViewArtist,
  onViewAlbum,
  onOpenLyrics,
  onOpenQueue,
  onOpenInfo,
}: Props) {
  const isVooxie = isVooxieTrack(track);
  const thumb = getItemCoverUrl(track);

  // Ver álbum: solo si el track tiene album_id
  const albumId = isVooxie ? (track as any).album_id ?? null : null;
  const hasAlbum = albumId !== null && onViewAlbum !== undefined;

  // addToQueue del store
  const addToQueue = usePlayerStore((s: PlayerState) => s.addToQueue);

  const actions: MenuAction[] = [
    {
      icon: isFavorite ? "heart" : "heart-outline",
      label: isFavorite ? "Quitar de favoritos" : "Me gusta",
      highlighted: isFavorite,
      onPress: () => {
        onToggleFavorite();
        onClose();
      },
    },
    {
      icon: "add-circle-outline",
      label: "Añadir a cola",
      onPress: () => {
        addToQueue(track);
        onClose();
      },
    },
    {
      icon: "list-outline",
      label: "Ver cola",
      onPress: () => {
        onOpenQueue();
      },
    },
    {
      icon: "text-outline",
      label: "Letra",
      onPress: () => {
        onOpenLyrics();
      },
    },
    {
      icon: "person-outline",
      label: "Ver artista",
      onPress: () => {
        onViewArtist?.();
        onClose();
      },
      hidden: !onViewArtist,
    },
    {
      icon: "albums-outline",
      label: "Ver álbum",
      onPress: () => {
        onViewAlbum?.();
        onClose();
      },
      hidden: !hasAlbum,
    },
    {
      icon: "information-circle-outline",
      label: "Información",
      onPress: () => {
        onOpenInfo();
        onClose();
      },
    },
    {
      icon: "share-outline",
      label: "Compartir",
      onPress: () => {
        onShare();
      },
    },
  ].filter((a) => !a.hidden);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        {/* Cabecera del track */}
        <View style={styles.trackHeader}>
          <View style={styles.trackThumb}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.thumbImg} />
            ) : (
              <Ionicons name="musical-note" size={18} color="rgba(255,255,255,0.4)" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.trackTitle}>
              {getItemTitle(track)}
            </Text>
            <Text numberOfLines={1} style={styles.trackArtist}>
              {getItemArtistName(track)}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Acciones */}
        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            style={({ pressed }: { pressed: boolean }) => [
              styles.action,
              pressed && styles.actionPressed,
            ]}
          >
            <Ionicons
              name={action.icon as any}
              size={20}
              color={action.highlighted ? "#FFFFFF" : "rgba(255,255,255,0.65)"}
            />
            <Text
              style={[
                styles.actionLabel,
                action.highlighted && { color: "#FFFFFF", fontWeight: "600" },
              ]}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}

        <View style={{ height: 16 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0D1018",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  trackHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  trackThumb: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  trackTitle: { fontSize: 14, fontWeight: "600", color: "#FFFFFF", marginBottom: 2 },
  trackArtist: { fontSize: 12, color: "rgba(255,255,255,0.45)" },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 8,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  actionPressed: { backgroundColor: "rgba(255,255,255,0.04)" },
  actionLabel: { fontSize: 15, fontWeight: "500", color: "rgba(255,255,255,0.7)" },
});
