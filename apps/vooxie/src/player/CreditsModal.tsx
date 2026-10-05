/**
 * CreditsModal — bottom sheet elegante de créditos de la canción.
 *
 * Muestra: artistas, featuring, compositores, productores.
 * Los datos reales vienen del campo `credits` del track (Fase futura).
 * Esta implementación renderiza lo que haya disponible desde el PlayableItem.
 */

import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  ScrollView,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type CreditEntry = {
  role: string;
  names: string[];
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  credits: CreditEntry[];
  bgColor?: string;
};

export function CreditsModal({
  visible,
  onClose,
  title,
  credits,
  bgColor = "#0B0F17",
}: Props) {
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 80,
        friction: 14,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 400,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: bgColor, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Créditos</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
          </Pressable>
        </View>

        <Text style={styles.songTitle} numberOfLines={2}>{title}</Text>

        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {credits.length > 0 ? (
            credits.map((credit, i) => (
              <View key={i} style={styles.creditBlock}>
                <Text style={styles.role}>{credit.role.toUpperCase()}</Text>
                {credit.names.map((name, j) => (
                  <Text key={j} style={styles.creditName}>{name}</Text>
                ))}
              </View>
            ))
          ) : (
            <Text style={styles.empty}>
              No hay créditos disponibles para esta canción.
            </Text>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
    maxHeight: "70%",
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
    justifyContent: "space-between",
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  songTitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    marginBottom: 24,
    lineHeight: 18,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
  creditBlock: {
    marginBottom: 20,
  },
  role: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.35)",
    marginBottom: 6,
  },
  creditName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  empty: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 14,
    textAlign: "center",
    marginTop: 20,
    lineHeight: 22,
  },
});
