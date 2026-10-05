import React from "react";
import { useRouter } from "expo-router";
import { TrackRow } from "@vooxie/ui";
import {
  usePlayerStore,
  useTrackFavorite,
  useTrackMenuStore,
  getItemId,
  getItemTitle,
  getItemArtistName,
  getItemCoverUrl,
  getItemIsExplicit,
  getItemDuration,
  type PlayableItem,
} from "@vooxie/core";
import { useToastStore } from "./useToastStore";

/** Fila de canción para cualquier fuente: reproduce, corazón unificado y menú con mantener presionado. */
export function ItemTrackRow({ item, queue, onPlayed }: { item: PlayableItem; queue: PlayableItem[]; onPlayed?: () => void }) {
  const router = useRouter();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const isActive = usePlayerStore((s) => (s.currentTrack ? getItemId(s.currentTrack) === getItemId(item) : false));
  const openMenu = useTrackMenuStore((s) => s.open);
  const { isFavorite, toggle } = useTrackFavorite(item);
  const toast = useToastStore((s) => s.show);

  return (
    <TrackRow
      title={getItemTitle(item)}
      artistName={getItemArtistName(item)}
      coverUrl={getItemCoverUrl(item)}
      durationSeconds={getItemDuration(item) ?? 0}
      isExplicit={getItemIsExplicit(item)}
      isFavorite={isFavorite}
      isActive={isActive}
      onPress={() => {
        playTrack(item, queue);
        onPlayed?.();
        router.push("/player");
      }}
      onToggleFavorite={async () => {
        const err = await toggle();
        if (err) toast(err);
      }}
      onLongPress={() => openMenu(item)}
    />
  );
}
