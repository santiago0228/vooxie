import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useTheme,
  spacing,
  typography,
  SectionHeader,
  ScreenHeader,
  TrackCard,
  ArtistAvatarCard,
  BrandSymbol,
  Skeleton,
  ErrorState,
  EmptyState,
} from "@vooxie/ui";
import {
  useAuthStore,
  useFavoritesStore,
  usePlayerStore,
  getNewReleases,
  getPopularTracks,
  getFeaturedArtists,
  type Track,
  type ArtistSummary,
} from "@vooxie/core";

function getGreetingWord(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

// Frases secundarias rotadas de forma controlada (por día, no al azar en
// cada render) — para que el Home no se sienta siempre idéntico sin que
// la frase cambie erráticamente cada vez que se re-renderiza la pantalla.
const SECONDARY_PHRASES = [
  "¿Listo para encontrar nueva música?",
  "¿Qué querés escuchar hoy?",
  "Tenemos algo nuevo para vos.",
  "Vamos a descubrir algo diferente.",
];

function getSecondaryPhrase(): string {
  const dayIndex = new Date().getDate();
  return SECONDARY_PHRASES[dayIndex % SECONDARY_PHRASES.length];
}

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

export default function HomeScreen() {
  const { theme } = useTheme();
  const router = useRouter();

  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const [newReleases, setNewReleases] = useState<LoadState<Track[]>>({
    status: "loading",
  });
  const [popular, setPopular] = useState<LoadState<Track[]>>({
    status: "loading",
  });
  const [artists, setArtists] = useState<LoadState<ArtistSummary[]>>({
    status: "loading",
  });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setNewReleases({ status: "loading" });
    setPopular({ status: "loading" });
    setArtists({ status: "loading" });

    const [releasesRes, popularRes, artistsRes] = await Promise.all([
      getNewReleases(),
      getPopularTracks(),
      getFeaturedArtists(),
    ]);

    setNewReleases(
      releasesRes.ok
        ? { status: "ready", data: releasesRes.data }
        : { status: "error", message: releasesRes.message },
    );
    setPopular(
      popularRes.ok
        ? { status: "ready", data: popularRes.data }
        : { status: "error", message: popularRes.message },
    );
    setArtists(
      artistsRes.ok
        ? { status: "ready", data: artistsRes.data }
        : { status: "error", message: artistsRes.message },
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function onPlay(track: Track, queue: Track[]) {
    playTrack(track, queue);
  }

  // Explorar sin cuenta: dar like sin sesión lleva a login en vez de
  // fallar en silencio (nunca un botón que "no hace nada").
  function onToggleFavorite(trackId: string) {
    if (!session) {
      router.push("/(auth)/login");
      return;
    }
    toggleFavorite(session.user.id, trackId);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.accent}
        />
      }
    >
      <ScreenHeader
        left={
          <Pressable
            onPress={() =>
              router.push(session ? "/(tabs)/profile" : "/(auth)/login")
            }
            hitSlop={8}
          >
            <View
              style={[
                styles.avatar,
                { backgroundColor: theme.surfaceElevated },
              ]}
            >
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={styles.avatarImage}
                />
              ) : (
                <Ionicons name="person" size={18} color={theme.textSecondary} />
              )}
            </View>
          </Pressable>
        }
        center={<BrandSymbol size={26} />}
      />

      <View style={styles.header}>
        <Text style={[styles.greetingMain, { color: theme.text }]}>
          {getGreetingWord()}
          {profile?.username ? `, ${profile.username}` : ""}.
        </Text>
        <Text
          style={[styles.greetingSecondary, { color: theme.textSecondary }]}
        >
          {getSecondaryPhrase()}
        </Text>
      </View>

      {/* Nuevos lanzamientos */}
      <SectionHeader title="Nuevos lanzamientos" />
      {newReleases.status === "loading" ? (
        <CardCarouselSkeleton />
      ) : newReleases.status === "error" ? (
        <ErrorState message={newReleases.message} onRetry={load} />
      ) : newReleases.data.length === 0 ? (
        <EmptyState
          title="Todavía no hay canciones"
          description="Cuando los artistas publiquen música, va a aparecer acá."
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
        >
          {newReleases.data.map((track) => (
            <TrackCard
              key={track.id}
              title={track.title}
              subtitle={track.artist.display_name}
              coverUrl={track.resolvedCoverUrl}
              onPress={() => onPlay(track, newReleases.data)}
            />
          ))}
        </ScrollView>
      )}

      <View style={{ height: spacing.xl }} />

      {/* Canciones populares */}
      <SectionHeader title="Canciones populares" />
      {popular.status === "loading" ? (
        <CardCarouselSkeleton />
      ) : popular.status === "error" ? (
        <ErrorState message={popular.message} onRetry={load} />
      ) : popular.data.length === 0 ? (
        <EmptyState title="Todavía no hay reproducciones" />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
        >
          {popular.data.map((track) => (
            <TrackCard
              key={track.id}
              title={track.title}
              subtitle={track.artist.display_name}
              coverUrl={track.resolvedCoverUrl}
              onPress={() => onPlay(track, popular.data)}
            />
          ))}
        </ScrollView>
      )}

      <View style={{ height: spacing.xl }} />

      {/* Artistas */}
      <SectionHeader title="Artistas" />
      {artists.status === "loading" ? (
        <View style={styles.artistSkeletonRow}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width={64} height={64} borderRadius={32} />
          ))}
        </View>
      ) : artists.status === "error" ? (
        <ErrorState message={artists.message} onRetry={load} />
      ) : artists.data.length === 0 ? (
        <EmptyState title="Todavía no hay artistas" icon="people-outline" />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
        >
          {artists.data.map((item) => (
            <ArtistAvatarCard
              key={item.id}
              name={item.display_name}
              avatarUrl={item.avatar_url}
              verified={item.verified}
              onPress={() => router.push(`/artist/${item.id}`)}
            />
          ))}
        </ScrollView>
      )}
    </ScrollView>
  );
}

function CardCarouselSkeleton() {
  return (
    <View
      style={{
        flexDirection: "row",
        paddingHorizontal: spacing.xl,
        gap: spacing.md,
      }}
    >
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} width={140} height={140} borderRadius={12} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: 2,
  },
  greetingMain: { ...typography.displayMd },
  greetingSecondary: { ...typography.body, marginTop: 2 },
  horizontalList: { paddingHorizontal: spacing.xl, gap: spacing.md },
  artistSkeletonRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
});
