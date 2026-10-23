import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { Asset, MediaType } from "expo-media-library";
import type { AssetMetadata } from "expo-media-library";
import type { Colors } from "../../ui/theme";
import { coral } from "../../ui/theme";
import { IconButton } from "../../ui/primitives";
import { styles as s } from "./MediaPicker.styles";

type Props = {
  asset: AssetMetadata;
  colors: Colors;
  selected: boolean;
  onClose: () => void;
  onToggle: () => void;
};

export function MediaPickerPreview(props: Props) {
  const [uri, setUri] = React.useState(props.asset.id);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    void new Asset(props.asset.id)
      .getUri()
      .then((next) => {
        if (alive) setUri(next);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [props.asset.id]);

  return (
    <View style={s.preview} accessibilityViewIsModal>
      <View style={s.previewHeader}>
        <IconButton
          name="close"
          label="Close preview"
          color="white"
          onPress={props.onClose}
        />
        <Text style={s.previewTitle} numberOfLines={1}>
          Preview
        </Text>
        <View style={{ width: 44 }} />
      </View>
      {props.asset.mediaType === MediaType.VIDEO ? (
        <PreviewVideo uri={uri} />
      ) : (
        <Image
          source={{ uri, width: props.asset.width, height: props.asset.height }}
          contentFit="contain"
          cachePolicy="memory-disk"
          allowDownscaling
          style={s.previewMedia}
        />
      )}
      {loading && (
        <ActivityIndicator
          size="large"
          color={coral}
          style={{ position: "absolute", alignSelf: "center", top: "50%" }}
        />
      )}
      <View style={s.previewFooter}>
        <Pressable
          accessibilityRole="button"
          onPress={props.onClose}
          style={s.previewAction}
        >
          <Text style={s.previewActionText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: props.selected }}
          onPress={props.onToggle}
          style={[s.previewAction, s.previewActionPrimary]}
        >
          <Text style={[s.previewActionText, s.previewActionPrimaryText]}>
            {props.selected ? "Selected" : "Select"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function PreviewVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (video) => {
    video.loop = true;
    video.muted = true;
  });
  React.useEffect(() => {
    player.play();
    return () => player.pause();
  }, [player]);
  return (
    <VideoView
      player={player}
      style={s.previewMedia}
      contentFit="contain"
      nativeControls
      surfaceType="textureView"
    />
  );
}
