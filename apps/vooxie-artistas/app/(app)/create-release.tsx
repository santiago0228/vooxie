import { useEffect, useState, memo } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { createAudioPlayer } from "expo-audio";
import {
  useTheme,
  Button,
  TextField,
  GenreChip,
  ScreenHeader,
  useSafeSpacing,
  spacing,
  radius,
  typography,
} from "@vooxie/ui";
import {
  useAuthStore,
  useReleaseDraftStore,
  listGenres,
  isSupportedAudioFile,
  publishRelease,
  validateDraftForPublish,
  type Genre,
  type DraftTrack,
  type ReleaseType,
} from "@vooxie/core";

const STEPS = [
  "Tipo",
  "Información",
  "Portada",
  "Canciones",
  "Revisión",
] as const;

/** Probe best-effort de duración: expo-audio no expone una promesa directa de
 * "cargado", así que se sondea `.duration` un rato corto. Si no llega a
 * tiempo, se guarda 0 (releaseService ya lo trata como opcional/no bloqueante). */
async function probeAudioDuration(uri: string): Promise<number> {
  return new Promise((resolve) => {
    const player = createAudioPlayer(uri);
    let settled = false;
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      clearTimeout(timeout);
      try {
        player.remove();
      } catch {
        // no-op
      }
      resolve(value);
    };
    const interval = setInterval(() => {
      if (player.isLoaded && player.duration > 0) {
        finish(Math.round(player.duration));
      }
    }, 150);
    const timeout = setTimeout(() => finish(0), 4000);
  });
}

export default function CreateReleaseScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { bottom } = useSafeSpacing();
  const artistProfile = useAuthStore((s) => s.artistProfile);

  const draft = useReleaseDraftStore((s) => s.draft);
  const hydrated = useReleaseDraftStore((s) => s.hydrated);
  const hydrate = useReleaseDraftStore((s) => s.hydrate);
  const setReleaseType = useReleaseDraftStore((s) => s.setReleaseType);
  const setInfo = useReleaseDraftStore((s) => s.setInfo);
  const setCover = useReleaseDraftStore((s) => s.setCover);
  const addTrack = useReleaseDraftStore((s) => s.addTrack);
  const updateTrack = useReleaseDraftStore((s) => s.updateTrack);
  const removeTrack = useReleaseDraftStore((s) => s.removeTrack);
  const resetDraft = useReleaseDraftStore((s) => s.reset);

  const [step, setStep] = useState(0);
  const [genres, setGenres] = useState<Pick<Genre, "id" | "name">[]>([]);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
    listGenres().then(setGenres);
  }, [hydrate]);

  function goNext() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function goBack() {
    if (step === 0) {
      router.back();
    } else {
      setStep((s) => s - 1);
    }
  }

  async function onDiscard() {
    await resetDraft();
    router.back();
  }

  async function onPublish() {
    if (!artistProfile) return;
    const errors = validateDraftForPublish(draft);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    setPublishError(null);
    setPublishing(true);

    try {
      const result = await publishRelease({
        artistId: artistProfile.id,
        draft,
        onProgress: (p) => {
          if (p.stage === "cover") setProgressLabel("Subiendo portada…");
          else if (p.stage === "audio")
            setProgressLabel(
              `Subiendo canción ${p.trackIndex + 1} de ${p.total}…`,
            );
          else if (p.stage === "saving") setProgressLabel("Guardando…");
        },
      });

      if (!result.ok) {
        setPublishError(result.message);
        return;
      }

      await resetDraft();
      router.replace("/(app)");
    } catch {
      setPublishError("Ocurrió un error inesperado. Inténtalo de nuevo.");
    } finally {
      setPublishing(false);
      setProgressLabel(null);
    }
  }

  if (!hydrated) return null;

  const editingTrack =
    draft.tracks.find((t) => t.localId === editingTrackId) ?? null;

  return (
    // KeyboardAvoidingView es esencial en iOS para que el teclado no
    // provoque un reajuste de layout que cierre el foco del TextInput.
    // Sin él, iOS intenta ajustar automáticamente el scroll cuando el
    // teclado sube, lo que puede disparar un blur() en el campo activo.
    // behavior="padding" es el modo correcto para pantallas con footer
    // fijo (ScreenHeader + ScrollView + botón): el footer sube con el
    // teclado y el ScrollView se reduce, sin remount ni pérdida de foco.
    // En Android no se usa (undefined) porque su sistema de ventanas
    // maneja el ajuste de forma nativa con windowSoftInputMode.
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader
        left={
          <Pressable onPress={goBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </Pressable>
        }
        center={
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {STEPS[step]}
          </Text>
        }
        right={
          <Pressable onPress={onDiscard} hitSlop={8}>
            <Text style={[styles.discardLabel, { color: theme.textSecondary }]}>
              Descartar
            </Text>
          </Pressable>
        }
      />

      <StepDots current={step} total={STEPS.length} />

      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: bottom + spacing.xxl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && (
          <TypeStep value={draft.releaseType} onChange={setReleaseType} />
        )}

        {step === 1 && (
          <InfoStep
            title={draft.title}
            description={draft.description}
            releaseDate={draft.releaseDate}
            onChange={setInfo}
          />
        )}

        {step === 2 && (
          <CoverStep uri={draft.localCoverUri} onChange={setCover} />
        )}

        {step === 3 && (
          <TracksStep
            releaseType={draft.releaseType}
            tracks={draft.tracks}
            genres={genres}
            onAddTrack={() => {
              const id = addTrack();
              setEditingTrackId(id);
            }}
            onEditTrack={(id) => setEditingTrackId(id)}
            onRemoveTrack={removeTrack}
          />
        )}

        {step === 4 && (
          <ReviewStep
            draft={draft}
            genres={genres}
            errors={validationErrors}
            publishError={publishError}
          />
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: bottom,
            borderTopColor: theme.border,
            backgroundColor: theme.background,
          },
        ]}
      >
        {step < STEPS.length - 1 ? (
          <Button label="Continuar" onPress={goNext} />
        ) : (
          <Button
            label={publishing ? (progressLabel ?? "Publicando…") : "Publicar"}
            onPress={onPublish}
            loading={publishing}
          />
        )}
      </View>

      <TrackEditorModal
        track={editingTrack}
        genres={genres}
        visible={editingTrack !== null}
        onClose={() => setEditingTrackId(null)}
        onChange={(patch) =>
          editingTrack && updateTrack(editingTrack.localId, patch)
        }
      />
    </KeyboardAvoidingView>
  );
}

// ─── Indicador de progreso del wizard ─────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  const { theme } = useTheme();
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: i <= current ? theme.accent : theme.border },
          ]}
        />
      ))}
    </View>
  );
}

// ─── Paso 1: tipo ──────────────────────────────────────────────────────────────

function TypeStep({
  value,
  onChange,
}: {
  value: ReleaseType;
  onChange: (t: ReleaseType) => void;
}) {
  const { theme } = useTheme();
  const options: { type: ReleaseType; label: string; description: string }[] = [
    { type: "single", label: "Single", description: "Una sola canción." },
    {
      type: "ep",
      label: "EP",
      description: "Varias canciones, formato corto.",
    },
    { type: "album", label: "Álbum", description: "Un lanzamiento completo." },
  ];

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={[styles.stepIntro, { color: theme.textSecondary }]}>
        ¿Qué quieres publicar?
      </Text>
      {options.map((opt) => (
        <Pressable
          key={opt.type}
          onPress={() => onChange(opt.type)}
          style={[
            styles.typeCard,
            {
              backgroundColor: theme.surfaceElevated,
              borderColor: value === opt.type ? theme.accent : theme.border,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.typeLabel, { color: theme.text }]}>
              {opt.label}
            </Text>
            <Text
              style={[styles.typeDescription, { color: theme.textSecondary }]}
            >
              {opt.description}
            </Text>
          </View>
          {value === opt.type ? (
            <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
          ) : (
            <View style={[styles.radioEmpty, { borderColor: theme.border }]} />
          )}
        </Pressable>
      ))}
    </View>
  );
}

// ─── Paso 2: información ───────────────────────────────────────────────────────
// memo() evita que InfoStep se re-renderice cuando CreateReleaseScreen
// actualiza estado no relacionado (publishing, step, validationErrors…).
// Sin memo, cada set() de Zustand causaba un render del padre que recreaba
// los TextInputs con nuevas props-función, lo que en Android producía
// parpadeo y pérdida de foco intermitente.

const InfoStep = memo(function InfoStep({
  title,
  description,
  releaseDate,
  onChange,
}: {
  title: string;
  description: string;
  releaseDate: string | null;
  onChange: (patch: {
    title?: string;
    description?: string;
    releaseDate?: string | null;
  }) => void;
}) {
  return (
    <View style={{ gap: spacing.md }}>
      <TextField
        label="Título"
        value={title}
        onChangeText={(v) => onChange({ title: v })}
      />
      <TextField
        label="Descripción (opcional)"
        value={description}
        onChangeText={(v) => onChange({ description: v })}
        multiline
      />
      <TextField
        label="Fecha de lanzamiento (opcional, AAAA-MM-DD)"
        value={releaseDate ?? ""}
        onChangeText={(v) => onChange({ releaseDate: v || null })}
        placeholder="2025-01-01"
        autoCapitalize="none"
      />
    </View>
  );
});

// ─── Paso 3: portada ───────────────────────────────────────────────────────────

function CoverStep({
  uri,
  onChange,
}: {
  uri: string | null;
  onChange: (uri: string | null) => void;
}) {
  const { theme } = useTheme();

  async function pick() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      onChange(result.assets[0].uri);
    }
  }

  return (
    <View style={{ alignItems: "center", gap: spacing.md }}>
      <Text
        style={[
          styles.stepIntro,
          { color: theme.textSecondary, alignSelf: "flex-start" },
        ]}
      >
        La portada es obligatoria para publicar.
      </Text>
      <Pressable
        onPress={pick}
        style={[
          styles.coverBox,
          { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.coverImage} />
        ) : (
          <View style={{ alignItems: "center" }}>
            <Ionicons
              name="image-outline"
              size={32}
              color={theme.textSecondary}
            />
            <Text
              style={[styles.coverPlaceholder, { color: theme.textSecondary }]}
            >
              Seleccionar imagen
            </Text>
          </View>
        )}
      </Pressable>
      {uri ? (
        <Button label="Reemplazar portada" variant="secondary" onPress={pick} />
      ) : null}
    </View>
  );
}

// ─── Paso 4: canciones ─────────────────────────────────────────────────────────

function TracksStep({
  releaseType,
  tracks,
  genres,
  onAddTrack,
  onEditTrack,
  onRemoveTrack,
}: {
  releaseType: ReleaseType;
  tracks: DraftTrack[];
  genres: Pick<Genre, "id" | "name">[];
  onAddTrack: () => void;
  onEditTrack: (localId: string) => void;
  onRemoveTrack: (localId: string) => void;
}) {
  const { theme } = useTheme();
  const canAddMore = releaseType !== "single" || tracks.length === 0;

  return (
    <View style={{ gap: spacing.md }}>
      {tracks.length === 0 ? (
        <Text style={[styles.stepIntro, { color: theme.textSecondary }]}>
          Todavía no agregaste ninguna canción.
        </Text>
      ) : (
        tracks.map((t) => (
          <Pressable
            key={t.localId}
            onPress={() => onEditTrack(t.localId)}
            style={[
              styles.trackCard,
              { backgroundColor: theme.surfaceElevated },
            ]}
          >
            <View
              style={[
                styles.trackAudioBadge,
                {
                  backgroundColor: t.localAudioUri
                    ? theme.accentSoft
                    : "transparent",
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons
                name={t.localAudioUri ? "musical-note" : "alert-circle-outline"}
                size={16}
                color={t.localAudioUri ? theme.accent : theme.danger}
              />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text
                style={[styles.trackTitle, { color: theme.text }]}
                numberOfLines={1}
              >
                {t.title || `Pista ${t.trackNumber}`}
              </Text>
              <Text
                style={[styles.trackSubtitle, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {t.localAudioFileName ?? "Sin audio"}
              </Text>
            </View>
            <Pressable onPress={() => onRemoveTrack(t.localId)} hitSlop={8}>
              <Ionicons
                name="trash-outline"
                size={18}
                color={theme.textSecondary}
              />
            </Pressable>
          </Pressable>
        ))
      )}

      {canAddMore ? (
        <Button
          label="+ Agregar canción"
          variant="secondary"
          onPress={onAddTrack}
        />
      ) : null}
    </View>
  );
}

// ─── Editor de canción (modal) ──────────────────────────────────────────────────

function TrackEditorModal({
  track,
  genres,
  visible,
  onClose,
  onChange,
}: {
  track: DraftTrack | null;
  genres: Pick<Genre, "id" | "name">[];
  visible: boolean;
  onClose: () => void;
  onChange: (patch: Partial<DraftTrack>) => void;
}) {
  const { theme } = useTheme();
  const { top, bottom } = useSafeSpacing();
  const [newFeat, setNewFeat] = useState("");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  async function pickAudio() {
    setAudioError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/*"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (!isSupportedAudioFile(asset.name)) {
      setAudioError("Formato no compatible. Usa MP3, M4A o WAV.");
      return;
    }

    onChange({ localAudioUri: asset.uri, localAudioFileName: asset.name });
    setProbing(true);
    const duration = await probeAudioDuration(asset.uri);
    onChange({ localAudioDurationSeconds: duration || null });
    setProbing(false);
  }

  if (!track) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ paddingTop: top }}>
          <View style={styles.modalHeader}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Canción
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: bottom + spacing.xxl,
            gap: spacing.md,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <TextField
            label="Título de la canción"
            value={track.title}
            onChangeText={(v) => onChange({ title: v })}
          />

          <View>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              AUDIO
            </Text>
            <Pressable
              onPress={pickAudio}
              style={[
                styles.audioPicker,
                {
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons
                name={
                  track.localAudioUri
                    ? "checkmark-circle"
                    : "cloud-upload-outline"
                }
                size={20}
                color={track.localAudioUri ? theme.accent : theme.textSecondary}
              />
              <Text
                style={[styles.audioPickerLabel, { color: theme.text }]}
                numberOfLines={1}
              >
                {probing
                  ? "Analizando archivo…"
                  : (track.localAudioFileName ??
                    "Seleccionar archivo (MP3, M4A, WAV)")}
              </Text>
            </Pressable>
            {audioError ? (
              <Text style={[styles.errorText, { color: theme.danger }]}>
                {audioError}
              </Text>
            ) : null}
          </View>

          <View>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              GÉNERO
            </Text>
            <View style={styles.genreWrap}>
              {genres.map((g) => (
                <GenreChip
                  key={g.id}
                  label={g.name}
                  selected={track.genreId === g.id}
                  onPress={() =>
                    onChange({ genreId: track.genreId === g.id ? null : g.id })
                  }
                />
              ))}
            </View>
          </View>

          <View>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              COLABORADORES (FEATS)
            </Text>
            {track.feats.map((f, i) => (
              <View key={i} style={styles.featRow}>
                <Text style={[styles.featName, { color: theme.text }]}>
                  {f}
                </Text>
                <Pressable
                  onPress={() =>
                    onChange({
                      feats: track.feats.filter((_, idx) => idx !== i),
                    })
                  }
                  hitSlop={8}
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={theme.textSecondary}
                  />
                </Pressable>
              </View>
            ))}
            <View style={styles.featInputRow}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Nombre del colaborador"
                  value={newFeat}
                  onChangeText={setNewFeat}
                />
              </View>
              <Pressable
                onPress={() => {
                  if (!newFeat.trim()) return;
                  onChange({ feats: [...track.feats, newFeat.trim()] });
                  setNewFeat("");
                }}
                style={[
                  styles.featAddButton,
                  { backgroundColor: theme.accent },
                ]}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>

          <TextField
            label="Descripción (opcional)"
            value={track.description}
            onChangeText={(v) => onChange({ description: v })}
            multiline
          />

          <View style={styles.explicitRow}>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              CONTENIDO EXPLÍCITO
            </Text>
            <Switch
              value={track.isExplicit}
              onValueChange={(v) => onChange({ isExplicit: v })}
              trackColor={{ false: theme.border, true: theme.accent }}
            />
          </View>

          <Button label="Listo" onPress={onClose} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Paso 5: revisión ───────────────────────────────────────────────────────────

function ReviewStep({
  draft,
  genres,
  errors,
  publishError,
}: {
  draft: ReturnType<typeof useReleaseDraftStore.getState>["draft"];
  genres: Pick<Genre, "id" | "name">[];
  errors: string[];
  publishError: string | null;
}) {
  const { theme } = useTheme();
  const genreName = (id: string | null) =>
    genres.find((g) => g.id === id)?.name;

  return (
    <View style={{ gap: spacing.lg }}>
      {(errors.length > 0 || publishError) && (
        <View
          style={[
            styles.errorBox,
            {
              backgroundColor: theme.surfaceElevated,
              borderColor: theme.danger,
            },
          ]}
        >
          {publishError ? (
            <Text style={[styles.errorBoxLine, { color: theme.danger }]}>
              {publishError}
            </Text>
          ) : (
            errors.map((e, i) => (
              <Text
                key={i}
                style={[styles.errorBoxLine, { color: theme.danger }]}
              >
                • {e}
              </Text>
            ))
          )}
        </View>
      )}

      <View style={styles.reviewHeader}>
        {draft.localCoverUri ? (
          <Image
            source={{ uri: draft.localCoverUri }}
            style={styles.reviewCover}
          />
        ) : (
          <View
            style={[
              styles.reviewCover,
              { backgroundColor: theme.surfaceElevated },
            ]}
          />
        )}
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text
            style={[styles.trackTitle, { color: theme.text }]}
            numberOfLines={2}
          >
            {draft.title || "Sin título"}
          </Text>
          <Text style={[styles.trackSubtitle, { color: theme.textSecondary }]}>
            {draft.releaseType === "single"
              ? "Single"
              : draft.releaseType === "ep"
                ? "EP"
                : "Álbum"}
            {draft.releaseDate ? ` · ${draft.releaseDate}` : ""}
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        {draft.tracks.map((t) => (
          <View
            key={t.localId}
            style={[
              styles.trackCard,
              { backgroundColor: theme.surfaceElevated },
            ]}
          >
            <Text
              style={[styles.trackTitle, { color: theme.text, flex: 1 }]}
              numberOfLines={1}
            >
              {t.trackNumber}. {t.title || "Sin título"}
            </Text>
            <Text
              style={[styles.trackSubtitle, { color: theme.textSecondary }]}
            >
              {genreName(t.genreId) ?? "Sin género"}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerTitle: { ...typography.bodyStrong },
  discardLabel: { ...typography.caption },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  dot: { width: 20, height: 3, borderRadius: 2 },
  stepIntro: { ...typography.body },
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  typeLabel: { ...typography.bodyStrong },
  typeDescription: { ...typography.caption, marginTop: 2 },
  radioEmpty: { width: 20, height: 20, borderRadius: 10, borderWidth: 1 },
  coverBox: {
    width: 200,
    height: 200,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coverImage: { width: "100%", height: "100%" },
  coverPlaceholder: { ...typography.caption, marginTop: spacing.xs },
  trackCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
  },
  trackAudioBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  trackTitle: { ...typography.bodyStrong },
  trackSubtitle: { ...typography.caption, marginTop: 2 },
  footer: { padding: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  fieldLabel: { ...typography.eyebrow, marginBottom: spacing.xs },
  audioPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  audioPickerLabel: { ...typography.body, flex: 1 },
  errorText: { ...typography.caption, marginTop: spacing.xs },
  genreWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  featRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  featName: { ...typography.body },
  featInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  featAddButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  explicitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  errorBoxLine: { ...typography.caption },
  reviewHeader: { flexDirection: "row", alignItems: "center" },
  reviewCover: { width: 72, height: 72, borderRadius: radius.md },
});
