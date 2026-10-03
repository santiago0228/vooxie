import { useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  useTheme,
  Button,
  TextField,
  FormScreen,
  ScreenHeader,
  EmptyState,
  ErrorState,
  Skeleton,
  useSafeSpacing,
  spacing,
  radius,
  typography,
} from "@vooxie/ui";
import {
  useAuthStore,
  createArtistProfile,
  updateArtistAvatar,
  uploadArtistAvatar,
  signOut,
  getArtistReleases,
  getArtistTotalPlays,
  type ArtistRelease,
} from "@vooxie/core";

// ─── Selector de foto reutilizable (creación + edición) ──────────────────────

function AvatarPicker({
  uri,
  onPick,
  size = 96,
}: {
  uri: string | null;
  onPick: (localUri: string) => void;
  size?: number;
}) {
  const { theme } = useTheme();

  async function pick() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      onPick(result.assets[0].uri);
    }
  }

  return (
    <Pressable onPress={pick} style={styles.avatarPickerWrap}>
      <View
        style={[
          styles.avatarPicker,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.surfaceElevated,
            borderColor: theme.border,
          },
        ]}
      >
        {uri ? (
          // cache="reload" evita que React Native sirva una imagen
          // antigua desde la caché de red cuando el artista cambia su
          // foto (la URI cambia con cada subida — timestamp distinto —
          // pero algunos proxies/CDN y la caché nativa de RN pueden
          // devolver la anterior si no se fuerza revalidación).
          <Image source={{ uri, cache: "reload" }} style={styles.avatarImage} />
        ) : (
          <Ionicons
            name="camera-outline"
            size={size * 0.32}
            color={theme.textSecondary}
          />
        )}
      </View>
      <Text style={[styles.avatarPickerLabel, { color: theme.accent }]}>
        {uri ? "Cambiar foto" : "Agregar foto (opcional)"}
      </Text>
    </Pressable>
  );
}

// ─── Crear perfil de artista (foto opcional — sección 5) ──────────────────────

function CreateArtistProfileForm() {
  const { theme } = useTheme();
  const session = useAuthStore((s) => s.session);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit() {
    if (!session) return;
    setFormError(null);
    setLoading(true);

    try {
      const result = await createArtistProfile({
        userId: session.user.id,
        displayName,
        bio,
      });

      if (!result.ok) {
        setFormError(result.message);
        return;
      }

      if (avatarUri) {
        const uploadResult = await uploadArtistAvatar(
          result.data.id,
          avatarUri,
        );
        if (uploadResult.ok) {
          await updateArtistAvatar(result.data.id, uploadResult.publicUrl);
        }
        // Si la subida de la foto falla, no bloqueamos la creación del
        // perfil — el artista puede agregarla después desde el dashboard.
      }

      await refreshProfile();
    } catch {
      setFormError("Ocurrió un error inesperado. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormScreen>
      <Text style={[styles.title, { color: theme.text }]}>
        Crea tu perfil de artista
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Este es el último paso antes de acceder a tu panel de VooXiE Artistas.
      </Text>

      <View style={{ height: spacing.lg }} />
      <AvatarPicker uri={avatarUri} onPick={setAvatarUri} />
      <View style={{ height: spacing.lg }} />

      <TextField
        label="Nombre de artista"
        value={displayName}
        onChangeText={setDisplayName}
        autoCapitalize="words"
      />
      <View style={{ height: spacing.md }} />
      <TextField
        label="Biografía (opcional)"
        value={bio}
        onChangeText={setBio}
        multiline
      />

      {formError ? (
        <Text style={[styles.formError, { color: theme.danger }]}>
          {formError}
        </Text>
      ) : null}

      <View style={{ height: spacing.lg }} />
      <Button
        label="Crear perfil de artista"
        onPress={onSubmit}
        loading={loading}
      />
    </FormScreen>
  );
}

// ─── Dashboard real (sección 6) ───────────────────────────────────────────────

function ArtistDashboard() {
  const { theme } = useTheme();
  const router = useRouter();
  const { bottom } = useSafeSpacing();
  const artistProfile = useAuthStore((s) => s.artistProfile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [releases, setReleases] = useState<ArtistRelease[] | null>(null);
  const [totalPlays, setTotalPlays] = useState(0);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    if (!artistProfile) return;
    setError(false);
    try {
      const [r, p] = await Promise.all([
        getArtistReleases(artistProfile.id),
        getArtistTotalPlays(artistProfile.id),
      ]);
      setReleases(r);
      setTotalPlays(p);
    } catch {
      setError(true);
    }
  }, [artistProfile]);

  // Recarga cada vez que el dashboard vuelve a tener foco (p.ej. al volver
  // de publicar un lanzamiento) — más simple y confiable que pasar params.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function onChangeAvatar(localUri: string) {
    if (!artistProfile) return;
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const uploadResult = await uploadArtistAvatar(artistProfile.id, localUri);
      if (uploadResult.ok) {
        await updateArtistAvatar(artistProfile.id, uploadResult.publicUrl);
        await refreshProfile();
      } else {
        // La foto anterior se conserva — no se modifica avatar_url si la
        // subida falló (regla: nunca dejar avatar_url apuntando a un archivo
        // inexistente o vacío).
        setAvatarError(uploadResult.message);
      }
    } catch {
      setAvatarError("No se pudo actualizar la foto. Inténtalo de nuevo.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function onSignOut() {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
  }

  if (!artistProfile) return null;

  const publishedTrackCount =
    releases?.reduce((acc, r) => acc + r.trackCount, 0) ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScreenHeader
        center={
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Mi panel
          </Text>
        }
        right={
          <Pressable onPress={onSignOut} hitSlop={8} disabled={signingOut}>
            <Ionicons
              name="log-out-outline"
              size={22}
              color={theme.textSecondary}
            />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottom + spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.accent}
          />
        }
      >
        <View style={styles.profileRow}>
          <AvatarPicker
            uri={artistProfile.avatar_url}
            onPick={onChangeAvatar}
            size={72}
          />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text
              style={[styles.artistName, { color: theme.text }]}
              numberOfLines={1}
            >
              {artistProfile.display_name}
            </Text>
            <Text style={[styles.statLine, { color: theme.textSecondary }]}>
              {avatarUploading
                ? "Subiendo foto…"
                : avatarError
                  ? avatarError
                  : `${publishedTrackCount} canción${publishedTrackCount === 1 ? "" : "es"} · ${totalPlays} reproducción${totalPlays === 1 ? "" : "es"}`}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}>
          <Button
            label="Crear lanzamiento"
            onPress={() => router.push("/(app)/create-release")}
          />
        </View>

        <View style={{ height: spacing.xl }} />

        {error ? (
          <ErrorState
            message="No pudimos cargar tus lanzamientos."
            onRetry={load}
          />
        ) : releases === null ? (
          <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
            <Skeleton height={72} />
            <Skeleton height={72} />
          </View>
        ) : releases.length === 0 ? (
          <EmptyState
            icon="disc-outline"
            title="Tu música empieza aquí"
            description="Publica tu primer lanzamiento en VooXiE."
            actionLabel="Crear lanzamiento"
            onAction={() => router.push("/(app)/create-release")}
          />
        ) : (
          <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
            {releases.map((r) => (
              <Pressable
                key={r.id}
                style={[
                  styles.releaseRow,
                  { backgroundColor: theme.surfaceElevated },
                ]}
              >
                {r.cover_url ? (
                  <Image
                    source={{ uri: r.cover_url }}
                    style={styles.releaseCover}
                  />
                ) : (
                  <View
                    style={[
                      styles.releaseCover,
                      { alignItems: "center", justifyContent: "center" },
                    ]}
                  >
                    <Ionicons
                      name="disc-outline"
                      size={20}
                      color={theme.textSecondary}
                    />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text
                    style={[styles.releaseTitle, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {r.title}
                  </Text>
                  <Text
                    style={[styles.statLine, { color: theme.textSecondary }]}
                  >
                    {r.trackCount} canción{r.trackCount === 1 ? "" : "es"}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export default function AppIndexScreen() {
  const artistProfile = useAuthStore((s) => s.artistProfile);
  return artistProfile ? <ArtistDashboard /> : <CreateArtistProfileForm />;
}

const styles = StyleSheet.create({
  title: { ...typography.displayMd, textAlign: "center" },
  subtitle: { ...typography.body, textAlign: "center", marginTop: spacing.xs },
  formError: {
    ...typography.caption,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  headerTitle: { ...typography.bodyStrong },
  avatarPickerWrap: { alignItems: "center", alignSelf: "center" },
  avatarPicker: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarPickerLabel: { ...typography.caption, marginTop: spacing.xs },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  artistName: { ...typography.displayMd },
  statLine: { ...typography.caption, marginTop: 2 },
  releaseRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  releaseCover: { width: 48, height: 48, borderRadius: radius.sm },
  releaseTitle: { ...typography.bodyStrong },
});
