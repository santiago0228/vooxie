/**
 * QueueSheet — cola de reproducción real.
 *
 * - Muestra: reproduciendo ahora / siguiente / anteriores.
 * - Permite reproducir directamente cualquier canción.
 * - Permite ELIMINAR canciones siguientes (deslizar o botón).
 * - Nunca elimina la canción actual.
 * - Usa el store como única fuente de verdad.
 * - Sincroniza currentIndex, shuffle cycle e historial al eliminar.
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  usePlayerStore,
  getItemTitle,
  getItemArtistName,
  getItemCoverUrl,
  getItemId,
  type PlayerState,
  type PlayableItem,
} from "@vooxie/core";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function QueueSheet({ visible, onClose }: Props) {
  const queue = usePlayerStore((s: PlayerState) => s.queue);
  const currentIndex = usePlayerStore((s: PlayerState) => s.currentIndex);
  const playTrack = usePlayerStore((s: PlayerState) => s.playTrack);
  const removeFromQueue = usePlayerStore((s: PlayerState) => s.removeFromQueue);

  const upNext = queue.slice(currentIndex + 1);
  const previous = queue.slice(0, currentIndex);
  const currentTrack = currentIndex >= 0 ? queue[currentIndex] : null;

  const handlePlay = useCallback(
    (absoluteIndex: number) => {
      const track = queue[absoluteIndex];
      if (track) {
        playTrack(track, queue);
        onClose();
      }
    },
    [queue, playTrack, onClose]
  );

  const handleRemove = useCallback(
    (absoluteIndex: number) => {
      removeFromQueue(absoluteIndex);
    },
    [removeFromQueue]
  );

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

        <View style={styles.header}>
          <Text style={styles.headerTitle}>Cola</Text>
          <Text style={styles.headerSub}>
            {queue.length} {queue.length === 1 ? "canción" : "canciones"}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {/* Reproduciendo ahora */}
          {currentTrack ? (
            <>
              <Text style={styles.sectionLabel}>REPRODUCIENDO AHORA</Text>
              <TrackRow
                track={currentTrack}
                isCurrent
                onPress={() => onClose()}
              />
            </>
          ) : null}

          {/* Siguientes — con botón de eliminar */}
          {upNext.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
                SIGUIENTE · {upNext.length}
              </Text>
              {upNext.map((track: PlayableItem, i: number) => {
                const absoluteIndex = currentIndex + 1 + i;
                return (
                  <React.Fragment key={getItemId(track)}>
                    <TrackRow
                      track={track}
                      onPress={() => handlePlay(absoluteIndex)}
                      onRemove={() => handleRemove(absoluteIndex)}
                    />
                  </React.Fragment>
                );
              })}
            </>
          ) : null}

          {/* Anteriores — solo visualización, sin eliminar */}
          {previous.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
                ANTERIORES
              </Text>
              {([...previous] as PlayableItem[])
                .reverse()
                .map((track: PlayableItem, i: number) => {
                  const absoluteIndex = currentIndex - 1 - i;
                  return (
                    <React.Fragment key={getItemId(track)}>
                      <TrackRow
                        track={track}
                        isPast
                        onPress={() => handlePlay(absoluteIndex)}
                      />
                    </React.Fragment>
                  );
                })}
            </>
          ) : null}

          {queue.length === 0 ? (
            <Text style={styles.empty}>La cola está vacía</Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Sub-componente fila de track ─────────────────────────────────────────────

type TrackRowProps = {
  track: PlayableItem;
  isCurrent?: boolean;
  isPast?: boolean;
  onPress: () => void;
  onRemove?: () => void;
};

function TrackRow({ track, isCurrent, isPast, onPress, onRemove }: TrackRowProps) {
  const thumb = getItemCoverUrl(track);

  return (
    <Pressable
      style={[styles.trackRow, isPast && styles.trackRowPast]}
      onPress={onPress}
    >
      {/* Thumbnail */}
      <View style={[styles.trackThumb, isCurrent && styles.trackThumbCurrent]}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.trackThumbImg} />
        ) : (
          <Ionicons name="musical-note" size={14} color="rgba(255,255,255,0.4)" />
        )}
        {isCurrent && (
          <View style={styles.currentOverlay}>
            <Ionicons name="volume-medium-outline" size={12} color="#fff" />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.trackInfo}>
        <Text
          numberOfLines={1}
          style={[
            styles.trackTitle,
            isCurrent && styles.trackTitleCurrent,
            isPast && styles.trackTitlePast,
          ]}
        >
          {getItemTitle(track)}
        </Text>
        <Text numberOfLines={1} style={styles.trackArtist}>
          {getItemArtistName(track)}
        </Text>
      </View>

      {/* Botón eliminar (solo para siguientes) */}
      {onRemove ? (
        <Pressable
          onPress={(e: import('react-native').GestureResponderEvent) => {
            e.stopPropagation();
            onRemove();
          }}
          hitSlop={10}
          style={styles.removeBtn}
        >
          <Ionicons name="close-circle-outline" size={20} color="rgba(255,255,255,0.3)" />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0D1018",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "78%",
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#FFFFFF" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.35)", flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.3)",
    marginBottom: 8,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  trackRowPast: { opacity: 0.5 },
  trackThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  trackThumbCurrent: {
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
  },
  trackThumbImg: { width: "100%", height: "100%" },
  currentOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  trackInfo: { flex: 1 },
  trackTitle: { fontSize: 13, fontWeight: "500", color: "rgba(255,255,255,0.75)" },
  trackTitleCurrent: { color: "#FFFFFF", fontWeight: "700" },
  trackTitlePast: { color: "rgba(255,255,255,0.5)" },
  trackArtist: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 },
  removeBtn: { padding: 4 },
  empty: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
});
