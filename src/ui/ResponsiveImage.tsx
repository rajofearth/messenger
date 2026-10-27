import React from "react";
import { PixelRatio } from "react-native";
import { Image } from "expo-image";
import type { ImageVariant } from "../domain/data";
import { chooseImageSource } from "../domain/imageVariants";

type Props = {
  uri?: string;
  variants?: ImageVariant[];
  sourceWidth?: number;
  previewUri?: string;
  previewWidth?: number;
  /** Display slot width in dp. */
  displayWidth: number;
  style: React.ComponentProps<typeof Image>["style"];
  contentFit?: React.ComponentProps<typeof Image>["contentFit"];
  recyclingKey?: string;
  accessibilityLabel?: string;
  onError?: () => void;
};

/**
 * An image surface that asks for the smallest stored width covering its slot.
 * Remote originals and variants share a storage-based cache key; a downloaded
 * preview is preferred when it is not narrower than the chosen variant.
 */
export function ResponsiveImage({
  uri,
  variants,
  sourceWidth,
  previewUri,
  previewWidth,
  displayWidth,
  style,
  contentFit,
  recyclingKey,
  accessibilityLabel,
  onError,
}: Props) {
  const choice = chooseImageSource({
    uri,
    variants,
    sourceWidth,
    displayWidth,
    density: PixelRatio.get(),
    preview:
      previewUri && previewWidth
        ? { uri: previewUri, width: previewWidth }
        : undefined,
  });
  return (
    <Image
      source={choice ? { uri: choice.uri, cacheKey: choice.cacheKey } : null}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      allowDownscaling
      recyclingKey={recyclingKey ?? choice?.cacheKey ?? uri}
      accessibilityLabel={accessibilityLabel}
      onError={onError}
    />
  );
}
