/**
 * Buscar — pantalla de búsqueda unificada de VOOXIE
 *
 * DISEÑO:
 * - Sin query: géneros/categorías con tarjetas visuales de colores
 * - Con query: lista única de resultados ordenados por relevancia
 *   (sin headers de fuente como "YouTube" / "Audius")
 * - Recientes: muestra los tracks reproducidos recientemente con portada
 *
 * FILOSOFÍA:
 * El usuario busca en VOOXIE, no "en YouTube" ni "en Audius".
 * Los resultados se muestran como una sola lista coherente.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Image,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useTheme,
  spacing,
  radius,
  typography,
  useSafeSpacing,
  TrackRow,
  ArtistAvatarCard,
  AlbumCard,
  Skeleton,
  EmptyState,
} from "@vooxie/ui";
import {
  useAuthStore,
  useFavoritesStore,
  usePlayerStore,
  getItemId,
  getItemCoverUrl,
  isExternalTrack,
  useRecentSearchesStore,
  getRecentCoverUrl,
  getRecentTitle,
  getRecentArtistName,
  useExternalSearch,
  searchCatalog,
  type SearchResults,
  shouldSearchAudius,
  normalizeVooxieTracks,
  normalizeVooxieArtists,
  normalizeVooxieAlbums,
  normalizeExternalTracks,
  mergeAndRank,
  limitBySource,
  type UnifiedResult,
} from "@vooxie/core";

const DEBOUNCE_MS = 400;

// ─── Categorías con colores y emojis (hardcoded — no dependen de Supabase) ───

const CATEGORIES = [
  { id: "reggaeton", label: "Reggaetón", color: "#C0392B", emoji: "🔥" },
  { id: "trap", label: "Trap", color: "#27AE60", emoji: "💎" },
  { id: "hiphop", label: "Hip Hop", color: "#D4AC0D", emoji: "🎤" },
  { id: "pop", label: "Pop", color: "#8E44AD", emoji: "⭐" },
  { id: "electronica", label: "Electrónica", color: "#2471A3", emoji: "⚡" },
  { id: "kpop", label: "K-Pop", color: "#E91E8C", emoji: "🌸" },
  { id: "rock", label: "Rock", color: "#E67E22", emoji: "🎸" },
  { id: "urbanolatino", label: "Urbano latino", color: "#1ABC9C", emoji: "🌴" },
  { id: "rnd", label: "R&B", color: "#6C3483", emoji: "🎵" },
  { id: "salsa", label: "Salsa", color: "#C0392B", emoji: "💃" },
  { id: "mexicana", label: "Música mexicana", color: "#E74C3C", emoji: "🌵" },
  { id: "exitos", label: "Éxitos", color: "#F39C12", emoji: "🏆" },
];

// ─── Componente de categoría ───────────────────────────────────────────────────

function CategoryCard({
  label,
  color,
  emoji,
  onPress,
}: {
  label: string;
  color: string;
  emoji: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryCard,
        { backgroundColor: color, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={styles.categoryEmoji}>{emoji}</Text>
      <Text style={styles.categoryLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Fila de resultado reciente ────────────────────────────────────────────────

function RecentRow({
  item,
  onPress,
  onRemove,
  onAddToQueue,
  theme,
}: {
  item: ReturnType<typeof useRecentSearchesStore.getState>["items"][number];
  onPress: () => void;
  onRemove: () => void;
  onAddToQueue: () => void;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  const coverUrl = getRecentCoverUrl(item);
  const title = getRecentTitle(item);
  const artistName = getRecentArtistName(item);

  return (
    <Pressable style={styles.recentRow} onPress={onPress}>
      {/* Portada */}
      <View
        style={[
          styles.recentCover,
          { backgroundColor: theme.surfaceElevated },
        ]}
      >
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.recentCoverImage} />
        ) : (
          <Ionicons name="musical-note" size={14} color={theme.textSecondary} />
        )}
      </View>

      {/* Info */}
      <View style={styles.recentInfo}>
        <Text
          numberOfLines={1}
          style={[styles.recentTitle, { color: theme.text }]}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.recentArtist, { color: theme.textSecondary }]}
        >
          {artistName}
        </Text>
      </View>

      {/* Acciones */}
      <Pressable onPress={onAddToQueue} hitSlop={10} style={styles.recentAction}>
        <Ionicons name="add-circle-outline" size={20} color={theme.textSecondary} />
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={10} style={styles.recentAction}>
        <Ionicons name="close" size={18} color={theme.textSecondary} />
      </Pressable>
    </Pressable>
  );
}

// ─── Fila de resultado unificado ──────────────────────────────────────────────

function UnifiedResultRow({
  result,
  query,
  currentTrackId,
  favoriteIds,
  onPressTrack,
  onPressArtist,
  onPressAlbum,
  onToggleFavorite,
  theme,
}: {
  result: UnifiedResult;
  query: string;
  currentTrackId: string | null;
  favoriteIds: Set<string>;
  onPressTrack: (result: UnifiedResult) => void;
  onPressArtist: (id: string, name: string) => void;
  onPressAlbum: (id: string, title: string) => void;
  onToggleFavorite: (trackId: string) => void;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  if (result.type === "artist") {
    if (result.vooxieArtist) {
      return (
        <Pressable
          style={styles.artistRow}
          onPress={() =>
            onPressArtist(
              result.vooxieArtist!.id,
              result.vooxieArtist!.display_name
            )
          }
        >
          <View
            style={[
              styles.artistAvatar,
              { backgroundColor: theme.surfaceElevated },
            ]}
          >
            {result.vooxieArtist.avatar_url ? (
              <Image
                source={{ uri: result.vooxieArtist.avatar_url }}
                style={styles.artistAvatarImage}
              />
            ) : (
              <Ionicons
                name="person"
                size={20}
                color={theme.textSecondary}
              />
            )}
          </View>
          <View style={styles.artistInfo}>
            <Text
              numberOfLines={1}
              style={[styles.resultTitle, { color: theme.text }]}
            >
              {result.vooxieArtist.display_name}
              {result.vooxieArtist.verified ? " ✓" : ""}
            </Text>
            <Text
              style={[styles.resultSubtitle, { color: theme.textSecondary }]}
            >
              Artista
            </Text>
          </View>
        </Pressable>
      );
    }
    return null;
  }

  if (result.type === "album" && result.vooxieAlbum) {
    return (
      <Pressable
        style={styles.albumRow}
        onPress={() =>
          onPressAlbum(result.vooxieAlbum!.id, result.vooxieAlbum!.title)
        }
      >
        <View
          style={[
            styles.albumCover,
            { backgroundColor: theme.surfaceElevated },
          ]}
        >
          {result.vooxieAlbum.cover_url ? (
            <Image
              source={{ uri: result.vooxieAlbum.cover_url }}
              style={styles.albumCoverImage}
            />
          ) : (
            <Ionicons name="disc" size={18} color={theme.textSecondary} />
          )}
        </View>
        <View style={styles.albumInfo}>
          <Text
            numberOfLines={1}
            style={[styles.resultTitle, { color: theme.text }]}
          >
            {result.vooxieAlbum.title}
          </Text>
          <Text
            style={[styles.resultSubtitle, { color: theme.textSecondary }]}
          >
            Álbum · {result.vooxieAlbum.artist.display_name}
          </Text>
        </View>
      </Pressable>
    );
  }

  if (result.type === "track" && result.track) {
    const track = result.track;
    const trackId = getItemId(track);
    const coverUrl = getItemCoverUrl(track);
    const isExternal = isExternalTrack(track);
    const artistName = isExternal
      ? track.artist.name
      : (track as Extract<typeof track, { artist: { display_name: string } }>)
          .artist.display_name;
    const duration = isExternal
      ? track.durationSeconds ?? undefined
      : (track as Extract<typeof track, { duration_seconds: number }>)
          .duration_seconds;
    const explicit = isExternal
      ? track.isExplicit
      : (track as Extract<typeof track, { is_explicit: boolean }>).is_explicit;

    return (
      <TrackRow
        title={track.title}
        artistName={artistName}
        coverUrl={coverUrl}
        durationSeconds={duration}
        isExplicit={explicit}
        isFavorite={!isExternal && favoriteIds.has(trackId)}
        isActive={currentTrackId === trackId}
        onPress={() => onPressTrack(result)}
        onToggleFavorite={
          !isExternal ? () => onToggleFavorite(trackId) : undefined
        }
      />
    );
  }

  return null;
}

// ─── Pantalla principal ────────────────────────────────────────────────────────

export default function SearchScreen() {
  const { theme } = useTheme();
  const { top, bottom } = useSafeSpacing();
  const router = useRouter();

  const session = useAuthStore((s) => s.session);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const currentTrackId = currentTrack ? getItemId(currentTrack) : null;

  const recentItems = useRecentSearchesStore((s) => s.items);
  const addTrack = useRecentSearchesStore((s) => s.addTrack);
  const removeRecent = useRecentSearchesStore((s) => s.remove);
  const clearRecents = useRecentSearchesStore((s) => s.clear);
  const recentArtists = useRecentSearchesStore((s) => s.artists);
  const addArtist = useRecentSearchesStore((s) => s.addArtist);
  const removeRecentArtist = useRecentSearchesStore((s) => s.removeArtist);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [vooxieResults, setVooxieResults] = useState<SearchResults | null>(null);
  const [vooxieLoading, setVooxieLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Búsqueda VOOXIE con debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setVooxieResults(null);
      setVooxieLoading(false);
      setDebouncedQuery("");
      return;
    }
    setVooxieLoading(true);
    debounceRef.current = setTimeout(async () => {
      setDebouncedQuery(query);
      const res = await searchCatalog(query);
      setVooxieLoading(false);
      if (res.ok) setVooxieResults(res.data);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Búsqueda externa — solo si la query lo justifica
  const auditedQuery = shouldSearchAudius(debouncedQuery) ? debouncedQuery : "";
  const { audius, youtube } = useExternalSearch(debouncedQuery, 12);

  // Resultados unificados ordenados por relevancia
  const unifiedResults = useMemo<UnifiedResult[]>(() => {
    if (!debouncedQuery) return [];

    const all: UnifiedResult[] = [];

    if (vooxieResults) {
      all.push(...normalizeVooxieTracks(debouncedQuery, vooxieResults.tracks));
      all.push(...normalizeVooxieArtists(debouncedQuery, vooxieResults.artists));
      all.push(...normalizeVooxieAlbums(debouncedQuery, vooxieResults.albums));
    }

    if (youtube.results?.tracks) {
      all.push(...normalizeExternalTracks(debouncedQuery, youtube.results.tracks));
    }

    // Audius: solo tracks (no artistas desconocidos)
    if (audius.results?.tracks && shouldSearchAudius(debouncedQuery)) {
      all.push(...normalizeExternalTracks(debouncedQuery, audius.results.tracks));
    }

    const ranked = mergeAndRank(all);
    return limitBySource(ranked, { vooxie: 30, youtube: 10, audius: 5 });
  }, [debouncedQuery, vooxieResults, youtube.results, audius.results]);

  const hasQuery = query.trim().length > 0;

  // Historial: canciones reproducidas + artistas abiertos, lo más reciente primero.
  const recentMixed = useMemo(() => {
    const all = [
      ...recentItems.map((item) => ({ kind: "track" as const, item, at: item.playedAt })),
      ...recentArtists.map((artist) => ({ kind: "artist" as const, artist, at: artist.playedAt })),
    ];
    return all.sort((a, b) => b.at - a.at).slice(0, 8);
  }, [recentItems, recentArtists]);
  const isLoading = vooxieLoading || audius.loading || youtube.loading;
  const hasResults = unifiedResults.length > 0;

  // Handlers
  const onPressTrack = useCallback(
    (result: UnifiedResult) => {
      if (!result.track) return;
      const trackQueue = unifiedResults
        .filter((r) => r.type === "track" && r.track)
        .map((r) => r.track!);
      playTrack(result.track, trackQueue);
      addTrack(result.track);
      router.push("/player");
    },
    [unifiedResults, playTrack, addTrack, router]
  );

  const onPressArtist = useCallback(
    (id: string, name: string) => {
      const artist = vooxieResults?.artists.find((a) => a.id === id);
      if (artist) addArtist(artist); // solo se guarda al ABRIR el perfil
      router.push(`/artist/${id}`);
    },
    [router, vooxieResults, addArtist]
  );

  const onPressAlbum = useCallback(
    (id: string, title: string) => {
      router.push(`/album/${id}`);
    },
    [router]
  );

  const onToggleFavorite = useCallback(
    (trackId: string) => {
      if (!session) {
        router.push("/(auth)/login");
        return;
      }
      toggleFavorite(session.user.id, trackId);
    },
    [session, router, toggleFavorite]
  );

  const onPressRecent = useCallback(
    (item: (typeof recentItems)[number]) => {
      const trackQueue = recentItems.map((r) => r.track);
      playTrack(item.track, trackQueue);
      router.push("/player");
    },
    [recentItems, playTrack, router]
  );

  const onAddToQueue = useCallback(
    (item: (typeof recentItems)[number]) => {
      // Añadir al final de la cola actual — para una implementación completa
      // de la cola en una fase posterior. Por ahora reproducir directamente.
      playTrack(item.track);
      router.push("/player");
    },
    [playTrack, router]
  );

  const onPressCategory = useCallback(
    (label: string) => {
      setQuery(label);
      inputRef.current?.focus();
    },
    []
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: top + spacing.sm }]}>
        <Text style={[styles.screenTitle, { color: theme.text }]}>Buscar</Text>
        {/* Campo de búsqueda */}
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: theme.surfaceElevated,
              borderColor: hasQuery ? theme.accent : theme.border,
            },
          ]}
        >
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            placeholder="¿Qué quieres escuchar?"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons
                name="close-circle"
                size={18}
                color={theme.textSecondary}
              />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottom + spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Sin query ─────────────────────────────────────────────── */}
        {!hasQuery ? (
          <>
            {/* Recientes */}
            {recentItems.length + recentArtists.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text
                    style={[styles.sectionTitle, { color: theme.text }]}
                  >
                    Escuchado recientemente
                  </Text>
                  <Pressable onPress={clearRecents} hitSlop={8}>
                    <Text
                      style={[
                        styles.sectionAction,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Limpiar
                    </Text>
                  </Pressable>
                </View>
                {recentMixed.map((entry) =>
                  entry.kind === "artist" ? (
                    <Pressable
                      key={entry.artist.id}
                      style={styles.recentRow}
                      onPress={() => router.push(`/artist/${entry.artist.artistId}`)}
                    >
                      <View style={[styles.recentCover, styles.recentArtistCover, { backgroundColor: theme.surfaceElevated }]}>
                        {entry.artist.avatarUrl ? (
                          <Image source={{ uri: entry.artist.avatarUrl }} style={styles.recentCoverImage} />
                        ) : (
                          <Ionicons name="person" size={20} color={theme.textSecondary} />
                        )}
                      </View>
                      <View style={styles.recentInfo}>
                        <Text numberOfLines={1} style={[styles.recentTitle, { color: theme.text }]}>
                          {entry.artist.name}
                          {entry.artist.verified ? " ✓" : ""}
                        </Text>
                        <Text style={[styles.recentArtist, { color: theme.textSecondary }]}>Artista</Text>
                      </View>
                      <Pressable onPress={() => removeRecentArtist(entry.artist.id)} hitSlop={10} style={styles.recentAction}>
                        <Ionicons name="close" size={18} color={theme.textSecondary} />
                      </Pressable>
                    </Pressable>
                  ) : (
                    <RecentRow
                      key={entry.item.id}
                      item={entry.item}
                      onPress={() => onPressRecent(entry.item)}
                      onRemove={() => removeRecent(entry.item.id)}
                      onAddToQueue={() => onAddToQueue(entry.item)}
                      theme={theme}
                    />
                  ),
                )}
              </View>
            )}

            {/* Categorías */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Explorar
              </Text>
              <View style={styles.categoriesGrid}>
                {CATEGORIES.map((cat) => (
                  <CategoryCard
                    key={cat.id}
                    label={cat.label}
                    color={cat.color}
                    emoji={cat.emoji}
                    onPress={() => onPressCategory(cat.label)}
                  />
                ))}
              </View>
            </View>
          </>
        ) : /* ── Con query ──────────────────────────────────────────── */
        isLoading && !hasResults ? (
          // Skeleton de carga
          <View style={styles.section}>
            {[1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.skeletonRow}>
                <Skeleton width={44} height={44} borderRadius={radius.sm} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton width="65%" height={13} />
                  <Skeleton width="40%" height={11} />
                </View>
              </View>
            ))}
          </View>
        ) : !hasResults ? (
          <EmptyState
            icon="search-outline"
            title="Sin resultados"
            description={`No encontramos nada para "${query}".`}
          />
        ) : (
          <View>
            {unifiedResults.map((result) => (
              <UnifiedResultRow
                key={result.key}
                result={result}
                query={debouncedQuery}
                currentTrackId={currentTrackId}
                favoriteIds={favoriteIds}
                onPressTrack={onPressTrack}
                onPressArtist={onPressArtist}
                onPressAlbum={onPressAlbum}
                onToggleFavorite={onToggleFavorite}
                theme={theme}
              />
            ))}

            {/* Spinner discreto si aún están llegando resultados externos */}
            {isLoading && (
              <View style={styles.loadingMore}>
                <Skeleton width={120} height={11} />
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  screenTitle: {
    ...typography.displayMd,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    paddingVertical: 2,
  },
  section: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.title,
    marginBottom: spacing.md,
  },
  sectionAction: {
    ...typography.caption,
  },
  // Categorías
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  categoryCard: {
    width: "47.5%",
    aspectRatio: 2.2,
    borderRadius: radius.md,
    padding: spacing.md,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  categoryEmoji: {
    fontSize: 28,
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    opacity: 0.6,
  },
  categoryLabel: {
    ...typography.bodyStrong,
    color: "#FFFFFF",
    fontSize: 14,
  },
  // Recientes
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  recentCover: {
    width: 46,
    height: 46,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  recentCoverImage: { width: "100%", height: "100%" },
  recentArtistCover: { borderRadius: 999 },
  recentInfo: { flex: 1 },
  recentTitle: { ...typography.bodyStrong, fontSize: 14 },
  recentArtist: { ...typography.caption, marginTop: 2 },
  recentAction: { paddingHorizontal: spacing.xs },
  // Artistas en resultados
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  artistAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  artistAvatarImage: { width: "100%", height: "100%" },
  artistInfo: { flex: 1 },
  // Álbumes en resultados
  albumRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  albumCover: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  albumCoverImage: { width: "100%", height: "100%" },
  albumInfo: { flex: 1 },
  // Subtítulos de resultados
  resultTitle: { ...typography.bodyStrong, fontSize: 14 },
  resultSubtitle: { ...typography.caption, marginTop: 2 },
  // Skeleton
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  loadingMore: {
    alignItems: "center",
    paddingVertical: spacing.lg,
  },
});
