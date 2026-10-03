import { isStreamValid } from "../external/youtube/mapper";
import { getItemSource, getItemStreamRef, isExternalTrack, type PlayableItem } from "./PlayableItem";

/** URL de audio reproducible del item, o null si todavía no hay una. */
export function getPlayableUri(item: PlayableItem | null): string | null {
  if (!item) return null;
  if (getItemSource(item) === "youtube") {
    if (isExternalTrack(item) && isStreamValid(item) && item.streamUrl) return item.streamUrl;
    return null;
  }
  const ref = getItemStreamRef(item);
  return ref ? ref : null;
}
