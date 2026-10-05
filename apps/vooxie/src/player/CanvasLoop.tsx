/**
 * CanvasLoop — video corto (Canvas) en bucle y SIN sonido, con expo-video.
 *
 *  · variant "cover": dentro del marco cuadrado de la portada (la portada se ve hasta que hay imagen).
 *  · variant "fill":  pantalla completa (estilo Spotify / Apple Music).
 *
 * Se pausa si la música está en pausa, mezcla audio con otras fuentes (no le quita el foco a
 * expo-audio) y avisa con `onError` para que el padre vuelva a la portada estática.
 */
import React, { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";

export function CanvasLoop({
  url,
  poster,
  playing,
  radius = 0,
  onError,
}: {
  url: string;
  poster?: string | null;
  playing: boolean;
  radius?: number;
  onError?: () => void;
}) {
  const [ready, setReady] = useState(false);

  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = true;
    p.muted = true;
    p.volume = 0;
    p.audioMixingMode = "mixWithOthers";
    p.showNowPlayingNotification = false;
    p.staysActiveInBackground = false;
    p.play();
  });

  useEffect(() => {
    setReady(false);
    const statusSub = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") setReady(true);
      if (status === "error") onError?.();
    });
    return () => statusSub.remove();
  }, [player, onError]);

  useEffect(() => {
    try {
      if (playing) player.play();
      else player.pause();
    } catch {
      /* el player pudo liberarse al cambiar de canción */
    }
  }, [playing, player]);

  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden", backgroundColor: "#000" }]}>
      {poster ? <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, { opacity: ready ? 1 : 0 }]}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
        pointerEvents="none"
      />
    </View>
  );
}
