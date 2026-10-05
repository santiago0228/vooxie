/**
 * Buscar — estilo Spotify.
 *
 *  · Reposo: título + campo + categorías.
 *  · Al tocar el campo: se abre la búsqueda con "Cancelar" y las BÚSQUEDAS RECIENTES
 *    (solo lo que reproduces/abres, no lo que escribes).
 *  · Con texto: chips (Todo / Canciones / Artistas / Álbumes), resultado principal y
 *    canciones "profesionales" del catálogo oficial primero. El audio se resuelve al tocar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Image,
  Keyboard,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useTheme,
  spacing,
  radius,
  typography,
  useSafeSpacing,
  Skeleton,
  EmptyState,
} from "@vooxie/ui";
import {
  usePlayerStore,
  getItemId,
  getItemTitle,
  getItemArtistName,
  getItemCoverUrl,
  getItemIsExplicit,
  useRecentSearchesStore,
  getRecentCoverUrl,
  getRecentTitle,
  getRecentArtistName,
  useExternalSearch,
  useTrackMenuStore,
  searchCatalog,
  buildSearchView,
  type PlayableItem,
  type SearchResults,
  type SearchArtistRef,
  type SearchAlbumRef,
} from "@vooxie/core";

const DEBOUNCE_MS = 350;

type Filter = "all" | "songs" | "artists" | "albums";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "songs", label: "Canciones" },
  { id: "artists", label: "Artistas" },
  { id: "albums", label: "Álbumes" },
];

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


// ─── Filas ─────────────────────────────────────────────────────────────────────

type Theme = ReturnType<typeof useTheme>["theme"];

function ExplicitBadge({ theme }: { theme: Theme }) {
  return (
    <View style={[styles.explicit, { backgroundColor: theme.textSecondary }]}>
      <Text style={[styles.explicitText, { color: theme.background }]}>E</Text>
    </View>
  );
}

function Row({
  image,
  round,
  title,
  subtitle,
  explicit,
  active,
  onPress,
  right,
  theme,
}: {
  image: string | null;
  round?: boolean;
  title: string;
  subtitle: string;
  explicit?: boolean;
  active?: boolean;
  onPress: () => void;
  right?: React.ReactNode;
  theme: Theme;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View
        style={[
          styles.rowImage,
          round && styles.rowImageRound,
          { backgroundColor: theme.surfaceElevated },
        ]}
      >
        {image ? (
          <Image source={{ uri: image }} style={styles.rowImageFill} />
        ) : (
          <Ionicons name={round ? "person" : "musical-note"} size={20} color={theme.textSecondary} />
        )}
      </View>
      <View style={styles.rowInfo}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: active ? theme.accent : theme.text }]}>
          {title}
        </Text>
        <View style={styles.rowSubRow}>
          {explicit ? <ExplicitBadge theme={theme} /> : null}
          <Text numberOfLines={1} style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
            {subtitle}
          </Text>
        </View>
      </View>
      {right}
    </Pressable>
  );
}

function SectionTitle({ children, theme }: { children: string; theme: Theme }) {
  return <Text style={[styles.sectionTitle, { color: theme.text }]}>{children}</Text>;
}

const kindLabel = (k: SearchAlbumRef["kind"]) =>
  k === "ep" ? "EP" : k === "single" ? "Sencillo" : k === "compilation" ? "Recopilación" : "Álbum";

// ─── Pantalla ──────────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const { theme } = useTheme();
  const { top, bottom } = useSafeSpacing();
  const router = useRouter();

  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const currentTrackId = currentTrack ? getItemId(currentTrack) : null;
  const openTrackMenu = useTrackMenuStore((s) => s.open);

  const recentItems = useRecentSearchesStore((s) => s.items);
  const recentArtists = useRecentSearchesStore((s) => s.artists);
  const addTrack = useRecentSearchesStore((s) => s.addTrack);
  const addArtist = useRecentSearchesStore((s) => s.addArtist);
  const removeRecent = useRecentSearchesStore((s) => s.remove);
  const removeRecentArtist = useRecentSearchesStore((s) => s.removeArtist);
  const clearRecents = useRecentSearchesStore((s) => s.clear);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [catalog, setCatalog] = useState<SearchResults | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Debounce + búsqueda en el catálogo propio (VooXiE / artistas importados).
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setDebouncedQuery("");
      setCatalog(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setDebouncedQuery(q);
      const res = await searchCatalog(q);
      if (!cancelled && res.ok) setCatalog(res.data);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const { audius, deezer, youtube } = useExternalSearch(debouncedQuery, 12);

  const view = useMemo(
    () =>
      buildSearchView({
        query: debouncedQuery,
        catalog,
        deezer: deezer.results,
        fallback: youtube.results,
        audius: audius.results,
        maxTracks: 8,
      }),
    [debouncedQuery, catalog, deezer.results, youtube.results, audius.results],
  );

  const hasQuery = query.trim().length > 0;
  const active = focused || hasQuery;
  const waiting = hasQuery && (query.trim() !== debouncedQuery || deezer.loading);
  const hasResults = view.tracks.length + view.artists.length + view.albums.length > 0;
  const loadingFallback = youtube.loading && !hasResults;

  const recentMixed = useMemo(() => {
    const all = [
      ...recentItems.map((item) => ({ kind: "track" as const, item, at: item.playedAt })),
      ...recentArtists.map((artist) => ({ kind: "artist" as const, artist, at: artist.playedAt })),
    ];
    return all.sort((a, b) => b.at - a.at).slice(0, 12);
  }, [recentItems, recentArtists]);

  // ── Acciones ──────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    setQuery("");
    setFocused(false);
    setFilter("all");
    Keyboard.dismiss();
    inputRef.current?.blur();
  }, []);

  const onPressTrack = useCallback(
    (track: PlayableItem) => {
      // Cola = las canciones visibles (para que "siguiente" tenga sentido); solo se guarda lo que se reproduce.
      playTrack(track, view.tracks);
      addTrack(track);
      Keyboard.dismiss();
      router.push("/player");
    },
    [playTrack, addTrack, view.tracks, router],
  );

  const onPressArtist = useCallback(
    (a: SearchArtistRef) => {
      addArtist({ id: a.id, display_name: a.name, avatar_url: a.avatarUrl, verified: a.verified });
      Keyboard.dismiss();
      router.push(`/artist/${encodeURIComponent(a.id)}`);
    },
    [addArtist, router],
  );

  const onPressAlbum = useCallback(
    (a: SearchAlbumRef) => {
      Keyboard.dismiss();
      router.push(`/album/${encodeURIComponent(a.id)}`);
    },
    [router],
  );

  const trackRow = (t: PlayableItem) => (
    <Row
      key={getItemId(t)}
      theme={theme}
      image={getItemCoverUrl(t)}
      title={getItemTitle(t)}
      subtitle={`Canción • ${getItemArtistName(t)}`}
      explicit={getItemIsExplicit(t)}
      active={currentTrackId === getItemId(t)}
      onPress={() => onPressTrack(t)}
      right={
        <Pressable onPress={() => openTrackMenu(t)} hitSlop={12} style={styles.rowAction}>
          <Ionicons name="ellipsis-horizontal" size={18} color={theme.textSecondary} />
        </Pressable>
      }
    />
  );

  const artistRow = (a: SearchArtistRef) => (
    <Row
      key={`a-${a.id}`}
      theme={theme}
      round
      image={a.avatarUrl}
      title={a.verified ? `${a.name} ✓` : a.name}
      subtitle="Artista"
      onPress={() => onPressArtist(a)}
    />
  );

  const albumRow = (a: SearchAlbumRef) => (
    <Row
      key={`al-${a.id}`}
      theme={theme}
      image={a.coverUrl}
      title={a.title}
      subtitle={`${kindLabel(a.kind)} • ${a.artistName}${a.year ? ` • ${a.year}` : ""}`}
      onPress={() => onPressAlbum(a)}
    />
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: top + spacing.sm }]}>
        {!active && <Text style={[styles.screenTitle, { color: theme.text }]}>Buscar</Text>}
        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchBar,
              { backgroundColor: theme.surfaceElevated, borderColor: active ? theme.accent : theme.border },
            ]}
          >
            <Ionicons name="search" size={18} color={theme.textSecondary} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onFocus={() => setFocused(true)}
              returnKeyType="search"
              placeholder="¿Qué quieres escuchar?"
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.text }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>
          {active && (
            <Pressable onPress={cancel} hitSlop={8}>
              <Text style={[styles.cancel, { color: theme.text }]}>Cancelar</Text>
            </Pressable>
          )}
        </View>

        {hasQuery && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {FILTERS.map((f) => {
              const on = filter === f.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFilter(f.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: on ? theme.accent : theme.surfaceElevated, borderColor: on ? theme.accent : theme.border },
                  ]}
                >
                  <Text style={[styles.chipText, { color: on ? "#fff" : theme.text }]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottom + spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Reposo: categorías ── */}
        {!active && (
          <View style={styles.section}>
            <SectionTitle theme={theme}>Explorar</SectionTitle>
            <View style={styles.categoriesGrid}>
              {CATEGORIES.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  label={cat.label}
                  color={cat.color}
                  emoji={cat.emoji}
                  onPress={() => {
                    setQuery(cat.label);
                    inputRef.current?.focus();
                  }}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Campo abierto sin texto: búsquedas recientes ── */}
        {active && !hasQuery && (
          <View style={styles.section}>
            <View style={styles.recentHeader}>
              <SectionTitle theme={theme}>Búsquedas recientes</SectionTitle>
              {recentMixed.length > 0 && (
                <Pressable onPress={clearRecents} hitSlop={8}>
                  <Text style={[styles.clear, { color: theme.textSecondary }]}>Borrar todo</Text>
                </Pressable>
              )}
            </View>
            {recentMixed.length === 0 ? (
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                Aquí aparecerán las canciones que reproduzcas y los artistas que abras.
              </Text>
            ) : (
              recentMixed.map((entry) =>
                entry.kind === "artist" ? (
                  <Row
                    key={entry.artist.id}
                    theme={theme}
                    round
                    image={entry.artist.avatarUrl}
                    title={entry.artist.verified ? `${entry.artist.name} ✓` : entry.artist.name}
                    subtitle="Artista"
                    onPress={() => router.push(`/artist/${encodeURIComponent(entry.artist.artistId)}`)}
                    right={
                      <Pressable onPress={() => removeRecentArtist(entry.artist.id)} hitSlop={12} style={styles.rowAction}>
                        <Ionicons name="close" size={20} color={theme.textSecondary} />
                      </Pressable>
                    }
                  />
                ) : (
                  <Row
                    key={entry.item.id}
                    theme={theme}
                    image={getRecentCoverUrl(entry.item)}
                    title={getRecentTitle(entry.item)}
                    subtitle={`Canción • ${getRecentArtistName(entry.item)}`}
                    explicit={getItemIsExplicit(entry.item.track)}
                    onPress={() => {
                      playTrack(entry.item.track, recentItems.map((r) => r.track));
                      Keyboard.dismiss();
                      router.push("/player");
                    }}
                    right={
                      <Pressable onPress={() => removeRecent(entry.item.id)} hitSlop={12} style={styles.rowAction}>
                        <Ionicons name="close" size={20} color={theme.textSecondary} />
                      </Pressable>
                    }
                  />
                ),
              )
            )}
          </View>
        )}

        {/* ── Con texto: resultados ── */}
        {hasQuery &&
          (waiting && !hasResults ? (
            <View style={styles.section}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <View key={i} style={styles.skeletonRow}>
                  <Skeleton width={56} height={56} borderRadius={radius.sm} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Skeleton width="60%" height={14} />
                    <Skeleton width="38%" height={11} />
                  </View>
                </View>
              ))}
            </View>
          ) : !hasResults && !loadingFallback ? (
            <EmptyState
              icon="search-outline"
              title="Sin resultados"
              description={`No encontramos nada para "${query.trim()}".`}
            />
          ) : (
            <View style={styles.results}>
              {filter === "all" && view.top && (
                <>
                  <SectionTitle theme={theme}>Resultado principal</SectionTitle>
                  {view.top.kind === "artist" ? artistRow(view.top.artist) : trackRow(view.top.track)}
                </>
              )}

              {(filter === "all" || filter === "songs") && view.tracks.length > 0 && (
                <>
                  {filter === "all" && <SectionTitle theme={theme}>Canciones</SectionTitle>}
                  {view.tracks
                    .filter((t) => !(filter === "all" && view.top?.kind === "track" && view.top.track === t))
                    .map(trackRow)}
                </>
              )}

              {(filter === "all" || filter === "artists") && view.artists.length > 0 && (
                <>
                  {filter === "all" && <SectionTitle theme={theme}>Artistas</SectionTitle>}
                  {view.artists
                    .filter((a) => !(filter === "all" && view.top?.kind === "artist" && view.top.artist === a))
                    .map(artistRow)}
                </>
              )}

              {(filter === "all" || filter === "albums") && view.albums.length > 0 && (
                <>
                  {filter === "all" && <SectionTitle theme={theme}>Álbumes</SectionTitle>}
                  {view.albums.map(albumRow)}
                </>
              )}

              {(waiting || loadingFallback) && (
                <View style={styles.loadingMore}>
                  <Skeleton width={120} height={11} />
                </View>
              )}
            </View>
          ))}
      </ScrollView>
    </View>
  );
}

// ─── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.md },
  screenTitle: { ...typography.displayMd },
  searchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: { flex: 1, ...typography.body, paddingVertical: 2 },
  cancel: { ...typography.bodyStrong },
  chips: { gap: spacing.sm, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  chipText: { ...typography.bodyStrong, fontSize: 14 },
  section: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  results: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  sectionTitle: { ...typography.title, marginTop: spacing.lg, marginBottom: spacing.sm },
  recentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  clear: { ...typography.caption },
  hint: { ...typography.body, marginTop: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8 },
  rowImage: { width: 56, height: 56, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  rowImageRound: { borderRadius: 28 },
  rowImageFill: { width: "100%", height: "100%" },
  rowInfo: { flex: 1, gap: 3 },
  rowTitle: { ...typography.bodyStrong, fontSize: 16 },
  rowSubRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowSubtitle: { ...typography.caption, flexShrink: 1, fontSize: 14 },
  rowAction: { paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  explicit: { width: 16, height: 16, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  explicitText: { fontSize: 10, fontWeight: "800" },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8 },
  loadingMore: { paddingVertical: spacing.lg, alignItems: "flex-start" },
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
  },});
