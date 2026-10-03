/**
 * Player Screen — Fase 5 (corrección final)
 *
 * FIX FLASH BLANCO: en lugar de usar `if/else` que desmonta y remonta árboles
 * completos (causando el flash), usamos un único árbol con tres secciones
 * siempre montadas, controlando visibilidad por `pointerEvents` y `opacity`
 * animada. Los modos "lyrics" y "canvas/video" no se recrean al volver.
 *
 * FIX ATMÓSFERA: GradientBg reemplazado por capas absolutas que cubren
 * toda la pantalla, con transición animada al cambiar de canción.
 *
 * FIX RENDERS: positionSeconds y durationSeconds se consumen solo en
 * PlayerProgressBar (memo) — no re-renderizan toda la pantalla.
 */

import React, { useState, useCallback, useRef, useEffect, memo } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Modal,
  Animated,
  ScrollView,
  Share,
  Alert,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type PlayerState,
  type AuthState,
  type FavoritesState,
  useAuthStore,
  useFavoritesStore,
  usePlayerStore,
  isVooxieTrack,
  isExternalTrack,
  getItemTitle,
  getItemArtistName,
  getItemIsExplicit,
  getItemSource,
  getItemId,
} from "@vooxie/core";

import { useDominantColor } from "../../src/player/useDominantColor";
import { usePlayerExtras } from "../../src/player/usePlayerExtras";
import { PlayerProgressBar } from "../../src/player/PlayerProgressBar";
import { PlayerMainControls } from "../../src/player/PlayerMainControls";
import { AudioOutputCard } from "../../src/player/AudioOutputCard";
import { LyricsView } from "../../src/player/LyricsView";
import { CanvasView } from "../../src/player/CanvasView";
import { CreditsModal } from "../../src/player/CreditsModal";
import { resolveArtwork } from "../../src/player/artworkResolver";
import { useExternalFavorites } from "../../src/player/useExternalFavorites";
import { QueueSheet } from "../../src/player/QueueSheet";
import { TrackMenuSheet } from "../../src/player/TrackMenuSheet";
import { LyricsService } from "../../src/player/LyricsService";

// ─── Sub-componente de progreso aislado (no re-renderiza el resto) ────────────

const ProgressSection = memo(function ProgressSection({
  onSeek,
  accentColor,
}: {
  onSeek: (s: number) => void;
  accentColor: string;
}) {
  const positionSeconds = usePlayerStore((s: PlayerState) => s.positionSeconds);
  const durationSeconds = usePlayerStore((s: PlayerState) => s.durationSeconds);
  return (
    <PlayerProgressBar
      positionSeconds={positionSeconds}
      durationSeconds={durationSeconds}
      onSeek={onSeek}
      accentColor="rgba(255,255,255,0.9)"
      trackColor="rgba(255,255,255,0.12)"
      textColor="rgba(255,255,255,0.38)"
    />
  );
});

// ─── Atmósfera de fondo con transición suave ──────────────────────────────────

/**
 * AtmosphereBg — fondo atmosférico continuo sin cortes.
 *
 * Estructura visual (de arriba a abajo):
 *   1. Color dominante de la portada como base completa
 *   2. Overlay oscuro progresivo desde la mitad (simula gradiente hacia negro)
 *   3. Capa muy oscura en la parte inferior para controles
 *   4. Overlay negro translúcido global para unificar y mantener legibilidad
 *
 * NO hay un corte horizontal visible. Las capas se superponen suavemente.
 */
function AtmosphereBg({
  colorTop,
  colorMid,
}: {
  colorTop: string;
  colorMid: string;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* 1. Base: color dominante oscuro cubre TODA la pantalla */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colorTop }]} />

      {/* 2. Capa media con opacidad — mezcla el color */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colorMid, opacity: 0.5 },
        ]}
      />

      {/* 3. Oscurecimiento superior suave (1/4 superior más claro) */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "25%",
          backgroundColor: "#000",
          opacity: 0.3,
        }}
      />

      {/* 4. Oscurecimiento progresivo desde el centro-alto hacia abajo.
           Capas escalonadas que simulan un gradiente natural sin librería. */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "80%",
          backgroundColor: "#000",
          opacity: 0.40,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "55%",
          backgroundColor: "#000",
          opacity: 0.38,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "30%",
          backgroundColor: "#000",
          opacity: 0.30,
        }}
      />

      {/* 5. Overlay global unificador — muy sutil */}
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: 0.12 }]}
      />
    </View>
  );
}

// ─── Selector visual Canvas/Video ─────────────────────────────────────────────

type VisualSelectorProps = {
  visible: boolean;
  onSelectCanvas: () => void;
  onSelectVideo: () => void;
  onDismiss: () => void;
};

function VisualSelector({
  visible,
  onSelectCanvas,
  onSelectVideo,
  onDismiss,
}: VisualSelectorProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
  }, [visible, opacity]);

  if (!mounted) return null;

  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      <Animated.View style={[selectorStyles.container, { opacity }]}>
        <Pressable onPress={onSelectCanvas} style={selectorStyles.option}>
          <Ionicons
            name="play-circle-outline"
            size={16}
            color="rgba(255,255,255,0.8)"
          />
          <Text style={selectorStyles.optionText}>Canvas</Text>
        </Pressable>
        <View style={selectorStyles.sep} />
        <Pressable onPress={onSelectVideo} style={selectorStyles.option}>
          <Ionicons
            name="videocam-outline"
            size={16}
            color="rgba(255,255,255,0.8)"
          />
          <Text style={selectorStyles.optionText}>Video</Text>
        </Pressable>
      </Animated.View>
    </>
  );
}

const selectorStyles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 52,
    right: 16,
    backgroundColor: "rgba(18,20,28,0.96)",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    minWidth: 138,
    zIndex: 100,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  optionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 12,
  },
});

// ─── Pantalla principal ────────────────────────────────────────────────────────

/**
 * Wrapper: si no hay track vuelve atrás. El contenido (con todos sus hooks) vive
 * en PlayerScreenContent y solo se monta con un track — así los hooks nunca se
 * llaman de forma condicional.
 */
export default function PlayerScreen() {
  const router = useRouter();
  const currentTrack = usePlayerStore((s: PlayerState) => s.currentTrack);

  useEffect(() => {
    if (!currentTrack) router.back();
  }, [currentTrack, router]);

  if (!currentTrack) return null;
  return <PlayerScreenContent currentTrack={currentTrack} />;
}

function PlayerScreenContent({ currentTrack }: { currentTrack: NonNullable<PlayerState["currentTrack"]> }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Selectores del store — granulares para minimizar re-renders
  const session = useAuthStore((s: AuthState) => s.session);
  const favoriteIds = useFavoritesStore((s: FavoritesState) => s.ids);
  const toggleFavorite = useFavoritesStore((s: FavoritesState) => s.toggle);
  const status = usePlayerStore((s: PlayerState) => s.status);
  const queue = usePlayerStore((s: PlayerState) => s.queue);
  const currentIndex = usePlayerStore((s: PlayerState) => s.currentIndex);
  const togglePlayPause = usePlayerStore((s: PlayerState) => s.togglePlayPause);
  const playNext = usePlayerStore((s: PlayerState) => s.playNext);
  const playPrevious = usePlayerStore((s: PlayerState) => s.playPrevious);
  const seekTo = usePlayerStore((s: PlayerState) => s.seekTo);
  // Duración real — solo para LyricsService.fetch (no para el render de progreso)
  const durationSeconds = usePlayerStore((s: PlayerState) => s.durationSeconds);

  // shuffle y repeat ahora viven en el store (afectan reproducción real)
  const shuffle = usePlayerStore((s: PlayerState) => s.shuffle);
  const repeatMode = usePlayerStore((s: PlayerState) => s.repeatMode);

  // viewMode: solo estado visual local
  const {
    viewMode, setViewMode,
    switchToLyrics, switchToCover,
  } = usePlayerExtras();

  // Favoritos externos (Audius/YouTube persistidos con AsyncStorage)
  const externalFavorites = useExternalFavorites();

  // UI state
  const [showCredits, setShowCredits] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showVisualSelector, setShowVisualSelector] = useState(false);

  // Animaciones de modo — opacidades para las tres vistas
  const coverOpacity = useRef(new Animated.Value(1)).current;
  const lyricsOpacity = useRef(new Animated.Value(0)).current;
  const canvasOpacity = useRef(new Animated.Value(0)).current;

  // Datos del track
  const source = getItemSource(currentTrack);
  const isYouTube = source === "youtube";
  const isVooxie = isVooxieTrack(currentTrack);
  const isExternal = isExternalTrack(currentTrack);
  const title = getItemTitle(currentTrack);
  const artistName = getItemArtistName(currentTrack);
  const isExplicit = getItemIsExplicit(currentTrack);
  const trackId = getItemId(currentTrack);

  // Favorito — VOOXIE usa Supabase, externos usan AsyncStorage
  const isFavoriteVooxie = isVooxie ? favoriteIds.has(trackId) : false;
  const isFavoriteExternal = isExternal
    ? externalFavorites.has(`${source}:${trackId}`)
    : false;
  const isFavorite = isVooxie ? isFavoriteVooxie : isFavoriteExternal;

  const artistId = isVooxie ? currentTrack.artist.id : null;
  const canvasUrl: string | null = (currentTrack as any).canvasUrl ?? null;
  const hasCanvas = !!canvasUrl;
  // El audio de YouTube se reproduce desde el stream resuelto (expo-audio); no hay
  // video embebido, así que el modo "video" ya no aplica. Canvas sigue disponible.
  const hasVideo = false;
  const hasBoth = hasCanvas && hasVideo;

  // Artwork
  const { large: coverLarge, thumb: coverThumb } = resolveArtwork(currentTrack, null);

  // Atmósfera dinámica
  const atm = useDominantColor(coverLarge);

  // Créditos
  const creditsData = isVooxie
    ? [{ role: "Artista", names: [currentTrack.artist.display_name] }]
    : [];

  // ── Animación de transición entre modos (sin flash) ─────────────────────────
  // En lugar de desmontar vistas, animamos la opacidad de cada sección.
  const transitionTo = useCallback(
    (target: "cover" | "lyrics" | "canvas" | "video") => {
      setShowVisualSelector(false);

      const targets = {
        cover: coverOpacity,
        lyrics: lyricsOpacity,
        canvas: canvasOpacity,
        video: canvasOpacity,
      };

      // Fade out actual
      const currentTarget =
        viewMode === "cover"
          ? coverOpacity
          : viewMode === "lyrics"
          ? lyricsOpacity
          : canvasOpacity;

      Animated.timing(currentTarget, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(() => {
        setViewMode(target);
        // Fade in nuevo
        Animated.timing(targets[target], {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }).start();
      });
    },
    [viewMode, coverOpacity, lyricsOpacity, canvasOpacity, setViewMode]
  );

  // Inicializar opacidades al cambiar de modo externo
  useEffect(() => {
    coverOpacity.setValue(viewMode === "cover" ? 1 : 0);
    lyricsOpacity.setValue(viewMode === "lyrics" ? 1 : 0);
    canvasOpacity.setValue(
      viewMode === "canvas" || viewMode === "video" ? 1 : 0
    );
  }, []); // Solo en mount

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleFavorite = useCallback(async () => {
    if (isVooxie) {
      if (!session) { router.push("/(auth)/login"); return; }
      await toggleFavorite(session.user.id, trackId);
    } else if (isExternal) {
      await externalFavorites.toggle(source, currentTrack as any);
    }
  }, [
    isVooxie, isExternal, session, toggleFavorite, trackId,
    externalFavorites, source, currentTrack, router,
  ]);

  function getToggleIcon(): string {
    if (viewMode !== "cover") return "image-outline";
    if (hasVideo && !hasCanvas) return "videocam-outline";
    if (hasCanvas && !hasVideo) return "play-circle-outline";
    return "sparkles-outline";
  }

  function handleToggleVisualMode() {
    if (viewMode !== "cover") {
      transitionTo("cover");
    } else if (hasBoth) {
      setShowVisualSelector((v: boolean) => !v);
    } else if (hasVideo) {
      transitionTo("video");
    } else if (hasCanvas) {
      transitionTo("canvas");
    }
  }

  const handleShare = useCallback(async () => {
    setShowMenu(false);
    try {
      await Share.share({ message: `${title} - ${artistName} en VOOXIE` });
    } catch {}
  }, [title, artistName]);

  // Letras desde LyricsService (arquitectura real)
  const [lyrics, setLyrics] = useState<
    { startSeconds: number; endSeconds: number; text: string }[]
  >([]);

  // Resetear letras al cambiar de canción
  useEffect(() => {
    setLyrics([]);
  }, [trackId]);

  // Buscar letras cuando se abre la vista
  useEffect(() => {
    if (viewMode !== "lyrics") return;
    LyricsService.fetch({
      title,
      artist: artistName,
      durationSeconds, // duración real del store
    }).then(setLyrics);
  }, [viewMode, title, artistName, durationSeconds]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.fullScreen, { backgroundColor: "#000" }]}>
      <Stack.Screen options={{ headerShown: false, presentation: "modal" }} />

      {/* Fondo de atmósfera — siempre presente detrás de todo */}
      <AtmosphereBg colorTop={atm.bg} colorMid={atm.bgMid} />

      {/* ── MODO PORTADA ──────────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity: coverOpacity },
          viewMode === "cover" ? styles.activeMode : styles.inactiveMode,
        ]}
        pointerEvents={viewMode === "cover" ? "box-none" : "none"}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Top bar */}
          <View style={styles.topBar}>
            <View style={styles.topSide}>
              <Pressable onPress={() => router.back()} hitSlop={14}>
                <Ionicons
                  name="chevron-down"
                  size={26}
                  color="rgba(255,255,255,0.85)"
                />
              </Pressable>
              <Pressable onPress={() => setShowInfo(true)} hitSlop={14}>
                <Ionicons
                  name="information-circle-outline"
                  size={19}
                  color="rgba(255,255,255,0.35)"
                />
              </Pressable>
            </View>

            <Text style={styles.topLabel}>REPRODUCIENDO</Text>

            <View style={[styles.topSide, { justifyContent: "flex-end" }]}>
              {(hasVideo || hasCanvas) ? (
                <Pressable onPress={handleToggleVisualMode} hitSlop={14}>
                  <Ionicons
                    name={getToggleIcon() as any}
                    size={19}
                    color="rgba(255,255,255,0.5)"
                  />
                </Pressable>
              ) : null}
              <Pressable onPress={() => setShowMenu(true)} hitSlop={14}>
                <Ionicons
                  name="ellipsis-horizontal"
                  size={22}
                  color="rgba(255,255,255,0.5)"
                />
              </Pressable>
            </View>
          </View>

          {/* Portada */}
          <View style={styles.coverArea}>
            <View style={styles.coverShadow}>
              {coverLarge ? (
                <Image
                  source={{ uri: coverLarge }}
                  style={styles.coverImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.coverEmpty}>
                  <Ionicons
                    name="musical-notes"
                    size={80}
                    color="rgba(255,255,255,0.12)"
                  />
                </View>
              )}
            </View>
          </View>

          {/* Título + artista + favorito */}
          <View style={styles.infoRow}>
            <View style={styles.infoText}>
              <Text numberOfLines={1} style={styles.trackTitle}>
                {title}
                {isExplicit ? "  🅴" : ""}
              </Text>
              {artistId ? (
                <Pressable
                  onPress={() => {
                    router.back();
                    setTimeout(() => router.push(`/artist/${artistId}`), 150);
                  }}
                >
                  <Text numberOfLines={1} style={styles.trackArtist}>
                    {artistName}
                  </Text>
                </Pressable>
              ) : (
                <Text numberOfLines={1} style={styles.trackArtist}>
                  {artistName}
                </Text>
              )}
            </View>
            <Pressable onPress={handleFavorite} hitSlop={14}>
              <Ionicons
                name={isFavorite ? "heart" : "heart-outline"}
                size={26}
                color={isFavorite ? "#FFFFFF" : "rgba(255,255,255,0.3)"}
              />
            </Pressable>
          </View>

          <View style={{ height: 22 }} />

          {/* Barra de progreso — aislada en memo para no re-renderizar el resto */}
          <ProgressSection onSeek={seekTo} accentColor="rgba(255,255,255,0.9)" />

          <View style={{ height: 26 }} />

          {/* Controles */}
          <PlayerMainControls
            isPlaying={status === "playing"}
            isLoading={status === "loading"}
            onTogglePlay={togglePlayPause}
            onNext={playNext}
            onPrevious={playPrevious}
            disableNext={
              currentIndex === -1 || currentIndex >= queue.length - 1
            }
            disablePrevious={currentIndex <= 0}
            accentColor="rgba(255,255,255,0.88)"
            mutedColor="rgba(255,255,255,0.26)"
          />

          <View style={{ height: 28 }} />

          {/* Audio output */}
          <AudioOutputCard
            deviceName={null}
            bgColor="rgba(255,255,255,0.05)"
            textColor="rgba(255,255,255,0.85)"
            mutedColor="rgba(255,255,255,0.38)"
          />

          <View style={{ height: 16 }} />

          {/* Créditos + Cola + Letra */}
          <View style={styles.bottomRow}>
            <Pressable
              onPress={() => setShowCredits(true)}
              style={styles.bottomBtn}
            >
              <Ionicons
                name="people-outline"
                size={15}
                color="rgba(255,255,255,0.62)"
              />
              <Text style={styles.bottomBtnLabel}>Créditos</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowQueue(true)}
              style={styles.bottomBtn}
            >
              <Ionicons
                name="list-outline"
                size={15}
                color="rgba(255,255,255,0.62)"
              />
              <Text style={styles.bottomBtnLabel}>Cola</Text>
            </Pressable>
            <Pressable
              onPress={() => transitionTo("lyrics")}
              style={styles.bottomBtn}
            >
              <Ionicons
                name="text-outline"
                size={15}
                color="rgba(255,255,255,0.62)"
              />
              <Text style={styles.bottomBtnLabel}>Letra</Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* Selector visual Canvas/Video */}
        <VisualSelector
          visible={showVisualSelector}
          onSelectCanvas={() => transitionTo("canvas")}
          onSelectVideo={() => transitionTo("video")}
          onDismiss={() => setShowVisualSelector(false)}
        />
      </Animated.View>

      {/* ── MODO LETRAS ─────────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity: lyricsOpacity },
          viewMode === "lyrics" ? styles.activeMode : styles.inactiveMode,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
        pointerEvents={viewMode === "lyrics" ? "box-none" : "none"}
      >
        <LyricsView
          lyrics={lyrics}
          isPlaying={status === "playing"}
          title={title}
          artistName={artistName}
          coverUrl={coverThumb}
          onSeek={seekTo}
          onTogglePlay={togglePlayPause}
          onNext={playNext}
          onPrevious={playPrevious}
          onClose={() => transitionTo("cover")}
          onCoverPress={() => transitionTo("cover")}
          accentColor={atm.accent}
        />
      </Animated.View>

      {/* ── MODO CANVAS / VIDEO ─────────────────────────────────────────────── */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity: canvasOpacity },
          viewMode === "canvas" || viewMode === "video"
            ? styles.activeMode
            : styles.inactiveMode,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
        pointerEvents={
          viewMode === "canvas" || viewMode === "video" ? "box-none" : "none"
        }
      >
        <CanvasView
          mode={viewMode === "video" ? "video" : "canvas"}
          canvasUrl={canvasUrl}
          isPlaying={status === "playing"}
          title={title}
          artistName={artistName}
          coverUrl={coverThumb}
          isFavorite={isFavorite}
          onSeek={seekTo}
          onTogglePlay={togglePlayPause}
          onNext={playNext}
          onPrevious={playPrevious}
          onClose={() => transitionTo("cover")}
          onToggleFavorite={handleFavorite}
          onVideoAreaReady={
            null
          }
        />
      </Animated.View>

      {/* ── Modales (siempre disponibles) ────────────────────────────────────── */}
      <CreditsModal
        visible={showCredits}
        onClose={() => setShowCredits(false)}
        title={title}
        credits={creditsData}
        bgColor="#0D1018"
      />

      <QueueSheet
        visible={showQueue}
        onClose={() => setShowQueue(false)}
      />

      <TrackMenuSheet
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        track={currentTrack}
        isFavorite={isFavorite}
        onToggleFavorite={handleFavorite}
        onShare={handleShare}
        onViewArtist={
          artistId
            ? () => {
                setShowMenu(false);
                router.back();
                setTimeout(() => router.push(`/artist/${artistId}`), 150);
              }
            : undefined
        }
        onViewAlbum={
          isVooxie && (currentTrack as any).album_id
            ? () => {
                setShowMenu(false);
                // Navegación al álbum — ruta disponible cuando se implemente
                router.push(`/album/${(currentTrack as any).album_id}`);
              }
            : undefined
        }
        onOpenLyrics={() => {
          setShowMenu(false);
          transitionTo("lyrics");
        }}
        onOpenQueue={() => {
          setShowMenu(false);
          setShowQueue(true);
        }}
        onOpenInfo={() => {
          setShowMenu(false);
          setShowInfo(true);
        }}
      />

      {/* Modal info de fuente */}
      <Modal
        visible={showInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfo(false)}
      >
        <Pressable
          style={styles.infoBackdrop}
          onPress={() => setShowInfo(false)}
        >
          <Pressable style={styles.infoBox}>
            <Text style={styles.infoBoxTitle}>Información</Text>
            <View style={styles.infoItem}>
              <Text style={styles.infoItemLabel}>Fuente</Text>
              <Text style={styles.infoItemValue}>
                {source === "vooxie"
                  ? "VOOXIE"
                  : source === "youtube"
                  ? "YouTube"
                  : "Audius"}
              </Text>
            </View>
            {source === "youtube" && (
              <View style={styles.infoItem}>
                <Text style={styles.infoItemLabel}>Motor</Text>
                <Text style={styles.infoItemValue}>YouTube IFrame API</Text>
              </View>
            )}
            {source === "audius" && (
              <View style={styles.infoItem}>
                <Text style={styles.infoItemLabel}>Protocolo</Text>
                <Text style={styles.infoItemValue}>Audius Network</Text>
              </View>
            )}
            <Pressable
              onPress={() => setShowInfo(false)}
              style={styles.infoDismiss}
            >
              <Text style={styles.infoDismissText}>Cerrar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const COVER_SIZE = 288;

const styles = StyleSheet.create({
  fullScreen: { flex: 1 },
  activeMode: { zIndex: 1 },
  inactiveMode: { zIndex: 0 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, flexGrow: 1 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  topSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: 70,
  },
  topLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 2.2,
    color: "rgba(255,255,255,0.38)",
    textTransform: "uppercase",
  },

  coverArea: { alignItems: "center", marginBottom: 30 },
  coverShadow: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.7,
    shadowRadius: 32,
    elevation: 16,
  },
  coverImage: { width: "100%", height: "100%" },
  coverEmpty: {
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },

  infoRow: { flexDirection: "row", alignItems: "center" },
  infoText: { flex: 1, marginRight: 14 },
  trackTitle: {
    fontSize: 21,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.1,
    marginBottom: 5,
  },
  trackArtist: {
    fontSize: 15,
    fontWeight: "400",
    color: "rgba(255,255,255,0.48)",
    letterSpacing: 0.1,
  },

  bottomRow: { flexDirection: "row", gap: 8 },
  bottomBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  bottomBtnLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 0.1,
  },

  infoBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  infoBox: {
    width: "100%",
    backgroundColor: "#111621",
    borderRadius: 18,
    padding: 24,
    gap: 4,
  },
  infoBoxTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  infoItemLabel: { fontSize: 13, color: "rgba(255,255,255,0.4)" },
  infoItemValue: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },
  infoDismiss: { marginTop: 14, alignItems: "center", paddingVertical: 10 },
  infoDismissText: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.42)",
  },
});
