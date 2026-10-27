import React, { useEffect, useRef, useState } from "react";
import { Animated, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import type { ImageVariant } from "../../domain/data";
import { ResponsiveImage } from "../../ui/ResponsiveImage";
import { styles as s } from "./Stories.styles";

type Props = {
  uri: string;
  variants?: ImageVariant[];
  sourceWidth?: number;
  previewUri?: string;
  previewWidth?: number;
  video?: boolean;
  paused?: boolean;
  preview?: boolean;
  controls?: boolean;
  poster?: string;
  crop?: "fit" | "fill";
  posterPlaceholder?: boolean;
  videoSurface?: boolean;
  onProgress?: (progress: number) => void;
  onEnd?: () => void;
};

function StoryVideo(props: Props) {
  return (
    <View style={s.image} pointerEvents={props.controls && props.videoSurface !== false ? "auto" : "none"}>
      {props.poster ? (
        <Image source={{ uri: props.poster }} style={s.image} contentFit={props.crop === "fill" ? "cover" : "contain"} />
      ) : props.posterPlaceholder ? (
        <View style={s.previewVideoPlaceholder}>
          <Text style={s.previewVideoPlaceholderText}>Loading video preview…</Text>
        </View>
      ) : null}
      {props.videoSurface !== false && <StoryVideoSurface key={props.uri} {...props} />}
    </View>
  );
}

function StoryVideoSurface(props: Props) {
  const latest = useRef(props);
  const [error, setError] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const revealedRef = useRef(false);
  const opacity = useRef(new Animated.Value(0)).current;
  latest.current = props;
  const player = useVideoPlayer(props.uri, (video) => {
    video.loop = !!props.preview;
    video.muted = !props.controls && !!props.preview;
    video.audioMixingMode = "mixWithOthers";
    video.timeUpdateEventInterval = 0.05;
  });
  useEffect(() => {
    const progress = player.addListener("timeUpdate", ({ currentTime }) => {
      if (player.duration > 0 && Number.isFinite(player.duration)) {
        latest.current.onProgress?.(Math.min(1, currentTime / player.duration));
      }
    });
    const ended = player.addListener("playToEnd", () => {
      if (!latest.current.paused) latest.current.onEnd?.();
    });
    const status = player.addListener("statusChange", ({ status }) => {
      setError(status === "error");
    });
    return () => {
      progress.remove();
      ended.remove();
      status.remove();
    };
  }, [player]);
  useEffect(() => {
    if (props.paused) player.pause();
    else player.play();
  }, [player, props.paused]);

  function revealVideo() {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setRevealed(true);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }

  return (
    <>
      <Animated.View style={[s.image, { opacity }]} pointerEvents={revealed && props.controls ? "auto" : "none"}>
        <VideoView
          player={player}
          style={s.image}
          contentFit={props.crop === "fill" ? "cover" : "contain"}
          nativeControls={!!props.controls}
          fullscreenOptions={{ enable: false }}
          buttonOptions={{ showBottomBar: true, showSeekForward: false, showSeekBackward: false, showSettings: false }}
          surfaceType="textureView"
          onFirstFrameRender={revealVideo}
        />
      </Animated.View>
      {error && (
        <Text style={s.mediaError}>
          Couldn't play this video. Tap to continue.
        </Text>
      )}
    </>
  );
}

export function StoryMedia(props: Props) {
  const { width } = useWindowDimensions();
  return props.video ? (
    <StoryVideo {...props} />
  ) : (
    <ResponsiveImage
      uri={props.uri}
      variants={props.variants}
      sourceWidth={props.sourceWidth}
      previewUri={props.previewUri}
      previewWidth={props.previewWidth}
      displayWidth={width}
      style={s.image}
      contentFit={props.crop === "fill" ? "cover" : "contain"}
    />
  );
}
