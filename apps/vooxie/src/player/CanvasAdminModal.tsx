/**
 * CanvasAdminModal — solo administradores: asigna (o quita) el Canvas de una canción.
 * Guarda con la RPC `admin_set_track_extras`, asociado al youtube_id; el servidor revalida el permiso.
 */
import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { adminSetTrackExtras, getItemTitle, type PlayableItem } from "@vooxie/core";

export function CanvasAdminModal({
  visible,
  track,
  videoId,
  currentCanvas,
  onClose,
  onSaved,
}: {
  visible: boolean;
  track: PlayableItem;
  videoId: string;
  currentCanvas: string | null;
  onClose: () => void;
  onSaved: (canvasUrl: string | null) => void;
}) {
  const [url, setUrl] = useState(currentCanvas ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (clear: boolean) => {
    const value = url.trim();
    if (!clear && !/^https:\/\/\S+\.(mp4|mov|m4v|webm)(\?\S*)?$/i.test(value)) {
      setError("Pega un enlace https a un video (.mp4 o .mov).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await adminSetTrackExtras(videoId, clear ? { clearCanvas: true } : { canvasUrl: value });
      onSaved(res.canvasUrl);
      onClose();
    } catch (e) {
      setError((e as Error).message || "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Canvas de “{getItemTitle(track)}”</Text>
          <Text style={styles.hint}>Video corto vertical (3–8 s), en bucle y sin sonido. Se asocia a esta canción.</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://…/canvas.mp4"
            placeholderTextColor="rgba(255,255,255,0.35)"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={() => save(false)} disabled={busy || !url.trim()} style={[styles.primary, (busy || !url.trim()) && { opacity: 0.45 }]}>
            {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>Guardar Canvas</Text>}
          </Pressable>
          {currentCanvas ? (
            <Pressable onPress={() => save(true)} disabled={busy} style={styles.secondary}>
              <Text style={styles.secondaryText}>Quitar Canvas</Text>
            </Pressable>
          ) : null}
          <View style={{ height: 22 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { backgroundColor: "#12151D", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, gap: 12 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  hint: { color: "rgba(255,255,255,0.5)", fontSize: 13 },
  input: { color: "#fff", fontSize: 15, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  error: { color: "#FF8A8A", fontSize: 13 },
  primary: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#000", fontSize: 16, fontWeight: "700" },
  secondary: { alignItems: "center", paddingVertical: 8 },
  secondaryText: { color: "#FF8A8A", fontSize: 15 },
});
