import React from "react";
import { PixelRatio, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import type { ImageStyle } from "react-native";
import type { AssetMetadata } from "expo-media-library";
import { getMediaThumbnail } from "../../services/mediaThumbnails";
import { trackDevEvent } from "../../services/devTelemetry";
import { thumbnailSizeForDisplay } from "./mediaPickerModel";

type Props = {
  asset: Pick<AssetMetadata, "id">;
  displaySize: number;
  style: ImageStyle;
  placeholderColor: string;
  recyclingKey?: string;
  priority?: "low" | "normal" | "high";
};

export function MediaPickerThumbnail(props: Props) {
  const [uri, setUri] = React.useState<string | null>(null);
  const size = thumbnailSizeForDisplay(props.displaySize, PixelRatio.get());

  React.useEffect(() => {
    let alive = true;
    const startedAt = Date.now();
    setUri(null);
    void getMediaThumbnail(props.asset.id, size).then((next) => {
      if (alive) {
        setUri(next);
        trackDevEvent("media_thumbnail_loaded", { durationMs: Date.now() - startedAt });
      }
    });
    return () => {
      alive = false;
    };
  }, [props.asset.id, size]);

  if (!uri) {
    return <View style={[props.style, { backgroundColor: props.placeholderColor }]} />;
  }

  return (
    <Image
      source={{ uri }}
      recyclingKey={props.recyclingKey ?? props.asset.id}
      contentFit="cover"
      transition={0}
      cachePolicy="memory-disk"
      priority={props.priority ?? "low"}
      allowDownscaling
      decodeFormat="rgb"
      style={props.style}
    />
  );
}

export const mediaPickerThumbnailStyles = StyleSheet.create({
  fill: { flex: 1 },
});
