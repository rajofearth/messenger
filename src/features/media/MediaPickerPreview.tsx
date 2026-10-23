import React from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { Asset, MediaType } from "expo-media-library";
import type { AssetMetadata } from "expo-media-library";
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Colors } from "../../ui/theme";
import { coral } from "../../ui/theme";
import { IconButton } from "../../ui/primitives";
import { getMediaThumbnail } from "../../services/mediaThumbnails";
import { styles as s } from "./MediaPicker.styles";

type Props = {
  assets: AssetMetadata[];
  initialIndex: number;
  colors: Colors;
  selection: string[];
  onClose: () => void;
  onToggle: (id: string) => void;
};

export function MediaPickerPreview(props: Props) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = React.useState(props.initialIndex);
  const list = React.useRef<FlatList<AssetMetadata>>(null);
  const current = props.assets[index] ?? props.assets[0];

  if (!current) return null;
  return (
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={s.preview} accessibilityViewIsModal>
      <StatusBar style="light" />
      <NavigationBar style="dark" />
      <View style={s.previewHeader}>
        <IconButton name="close" label="Close preview" color="white" onPress={props.onClose} />
        <Text style={s.previewTitle} numberOfLines={1}>
          {index + 1} / {props.assets.length}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <FlatList
        ref={list}
        data={props.assets}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={props.initialIndex}
        getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index: itemIndex }) => (
          <PreviewPage
            asset={item}
            width={width}
            active={itemIndex === index}
            selected={props.selection.includes(item.id)}
            onToggle={() => props.onToggle(item.id)}
            colors={props.colors}
          />
        )}
        onMomentumScrollEnd={(event) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width));
          setIndex(Math.max(0, Math.min(next, props.assets.length - 1)));
        }}
      />
      <View style={s.previewFooter}>
        <Pressable accessibilityRole="button" onPress={props.onClose} style={s.previewAction}>
          <Text style={s.previewActionText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: props.selection.includes(current.id) }}
          onPress={() => props.onToggle(current.id)}
          style={[s.previewAction, s.previewActionPrimary]}
        >
          <Text style={[s.previewActionText, s.previewActionPrimaryText]}>
            {props.selection.includes(current.id) ? "Selected" : "Select"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function PreviewPage({
  asset,
  width,
  active,
  selected,
  onToggle,
  colors,
}: {
  asset: AssetMetadata;
  width: number;
  active: boolean;
  selected: boolean;
  onToggle: () => void;
  colors: Colors;
}) {
  const [thumbnailUri, setThumbnailUri] = React.useState<string | null>(null);
  const [uri, setUri] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    setThumbnailUri(null);
    setUri(null);
    void getMediaThumbnail(asset.id, 384).then((next) => {
      if (alive) setThumbnailUri(next);
    });
    void new Asset(asset.id).getUri().then((next) => {
      if (alive) setUri(next);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [asset.id]);

  return (
    <View style={[s.previewStage, { width }]}>
      {asset.mediaType === MediaType.VIDEO && active && uri ? (
        <PreviewVideo uri={uri} />
      ) : thumbnailUri ? (
        <Image source={{ uri: uri ?? thumbnailUri }} contentFit="contain" cachePolicy="memory-disk" allowDownscaling style={s.previewMedia} />
      ) : null}
      {!uri && <ActivityIndicator size="large" color={coral} style={s.previewLoading} />}
      {asset.mediaType === MediaType.VIDEO && active && uri && <Text style={s.previewAudioHint}>Sound on · autoplaying</Text>}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={selected ? "Deselect media" : "Select media"}
        onPress={onToggle}
        style={[s.previewSelectBadge, selected && s.previewSelectBadgeSelected]}
      >
        <Ionicons name={selected ? "checkmark" : "add"} size={20} color={selected ? colors.onCoral : "white"} />
      </Pressable>
    </View>
  );
}

function PreviewVideo({ uri }: { uri: string }) {
  const [playing, setPlaying] = React.useState(true);
  const [muted, setMuted] = React.useState(false);
  const player = useVideoPlayer(uri, (video) => {
    video.loop = true;
    video.muted = false;
    video.audioMixingMode = "mixWithOthers";
    video.play();
  });

  React.useEffect(() => {
    const playingChange = player.addListener("playingChange", ({ isPlaying }) => setPlaying(isPlaying));
    const mutedChange = player.addListener("mutedChange", ({ muted: nextMuted }) => setMuted(nextMuted));
    player.play();
    return () => {
      playingChange.remove();
      mutedChange.remove();
      player.pause();
    };
  }, [player]);

  return (
    <View style={s.previewVideoSurface}>
      <VideoView player={player} style={s.previewMedia} contentFit="contain" nativeControls={false} surfaceType="surfaceView" />
      <View style={s.previewVideoControls}>
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? "Pause video" : "Play video"} onPress={() => playing ? player.pause() : player.play()} style={s.previewVideoButton}>
          <Ionicons name={playing ? "pause" : "play"} size={20} color="white" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={muted ? "Unmute video" : "Mute video"} onPress={() => { player.muted = !muted; }} style={s.previewVideoButton}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={20} color="white" />
        </Pressable>
      </View>
    </View>
  );
}
