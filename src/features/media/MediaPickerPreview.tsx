import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { Asset, MediaType } from "expo-media-library";
import type { AssetMetadata } from "expo-media-library";
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Colors } from "../../ui/theme";
import { coral } from "../../ui/theme";
import { IconButton } from "../../ui/primitives";
import { styles as s } from "./MediaPicker.styles";
import { getMediaThumbnail } from "../../services/mediaThumbnails";

type Props = {
  asset: AssetMetadata;
  colors: Colors;
  selected: boolean;
  onClose: () => void;
  onToggle: () => void;
};

export function MediaPickerPreview(props: Props) {
  const [thumbnailUri, setThumbnailUri] = React.useState<string | null>(null);
  const [uri, setUri] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    setThumbnailUri(null);
    setUri(null);
    void getMediaThumbnail(props.asset.id, 384).then((next) => {
      if (alive) setThumbnailUri(next);
    });
    void new Asset(props.asset.id)
      .getUri()
      .then((next) => {
        if (alive) setUri(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [props.asset.id]);

  const loading = !uri;
  return (
    <SafeAreaView
      edges={["top", "bottom", "left", "right"]}
      style={s.preview}
      accessibilityViewIsModal
    >
      <StatusBar style="light" />
      <NavigationBar style="dark" />
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
      <View style={s.previewStage}>
        {props.asset.mediaType === MediaType.VIDEO && uri ? (
          <PreviewVideo uri={uri} />
        ) : props.asset.mediaType === MediaType.VIDEO && thumbnailUri ? (
          <Image
            source={{ uri: thumbnailUri }}
            contentFit="contain"
            cachePolicy="memory-disk"
            style={s.previewMedia}
          />
        ) : thumbnailUri ? (
          <Image
            source={{ uri: uri ?? thumbnailUri }}
            contentFit="contain"
            cachePolicy="memory-disk"
            allowDownscaling
            style={s.previewMedia}
          />
        ) : null}
        {loading && <ActivityIndicator size="large" color={coral} style={s.previewLoading} />}
      </View>
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
    </SafeAreaView>
  );
}

function PreviewVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (video) => {
    video.loop = true;
    video.muted = true;
  });
  return (
    <VideoView
      player={player}
      style={s.previewMedia}
      contentFit="contain"
      nativeControls
      surfaceType="surfaceView"
      fullscreenOptions={{ enable: false }}
      buttonOptions={{
        showNext: false,
        showPrevious: false,
        showSettings: false,
        showSeekForward: true,
        showSeekBackward: true,
        showPlayPause: true,
        showBottomBar: true,
      }}
    />
  );
}
